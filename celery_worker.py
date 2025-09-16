import os
import subprocess
import logging
from celery import Celery
from google.cloud import storage, secretmanager
import firebase_admin
from firebase_admin import credentials, firestore
import noisereduce as nr
from scipy.io import wavfile
import tempfile
import json

# --- الإعدادات الأساسية ---
logging.basicConfig(level=logging.INFO)

# --- جلب الإعدادات الحساسة ---
project_id = os.environ.get('GCP_PROJECT')

def get_secret(secret_id, version_id="latest"):
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/{version_id}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

# --- إعداد Celery ---
REDIS_IP = os.environ.get('REDIS_IP')
REDIS_URL = f"redis://{REDIS_IP}:6379/0"
celery_app = Celery('tasks', broker=REDIS_URL, backend=REDIS_URL)

# --- إعداد Firebase و GCS ---
if not firebase_admin._apps:
    firebase_credentials_json = get_secret("firebase-credentials")
    cred = credentials.Certificate(json.loads(firebase_credentials_json))
    firebase_admin.initialize_app(cred)

db = firestore.client()
storage_client = storage.Client()
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME')

@celery_app.task(bind=True)
def process_audio_task(self, task_data):
    task_id = self.request.id
    user_id = task_data['user_id']
    gcs_input_path = task_data['gcs_input_path']
    operation = task_data['operation']
    options = task_data.get('options', {})

    db.collection('tasks').document(task_id).set({
        'userId': user_id,
        'status': 'processing',
        'operation': operation,
        'createdAt': firestore.SERVER_TIMESTAMP
    })

    try:
        bucket = storage_client.bucket(BUCKET_NAME)
        input_blob = bucket.blob(gcs_input_path)

        with tempfile.TemporaryDirectory() as temp_dir:
            base_filename = os.path.basename(gcs_input_path)
            local_input_path = os.path.join(temp_dir, base_filename)
            input_blob.download_to_filename(local_input_path)
            
            output_files = {}

            if operation == 'separate':
                stems = options.get('stems', ['vocals'])
                model_name = "htdemucs"
                
                command = ["python3", "-m", "demucs.separate", "-n", model_name, "-o", temp_dir]
                if len(stems) == 1 and 'vocals' in stems:
                    command.extend(["--two-stems=vocals"])
                
                command.append(local_input_path)
                
                subprocess.run(command, check=True, capture_output=True, text=True)

                output_folder = os.path.join(temp_dir, model_name, os.path.splitext(base_filename)[0])
                
                for stem_file in os.listdir(output_folder):
                    local_path = os.path.join(output_folder, stem_file)
                    gcs_path = f"processed/{user_id}/{task_id}/{stem_file}"
                    blob = bucket.blob(gcs_path)
                    blob.upload_from_filename(local_path)
                    blob.make_public() # Make file publicly accessible
                    output_files[os.path.splitext(stem_file)[0]] = blob.public_url

            elif operation == 'enhance':
                wav_filepath = os.path.join(temp_dir, 'temp_for_enhance.wav')
                subprocess.run(['ffmpeg', '-i', local_input_path, wav_filepath, '-y'], check=True)
                rate, data = wavfile.read(wav_filepath)
                reduced_noise_data = nr.reduce_noise(y=data, sr=rate)
                
                output_filename = f"enhanced_{base_filename}.wav"
                local_output_path = os.path.join(temp_dir, output_filename)
                wavfile.write(local_output_path, rate, reduced_noise_data)

                gcs_path = f"processed/{user_id}/{task_id}/{output_filename}"
                blob = bucket.blob(gcs_path)
                blob.upload_from_filename(local_output_path)
                blob.make_public() # Make file publicly accessible
                output_files['enhanced'] = blob.public_url

            db.collection('tasks').document(task_id).update({
                'status': 'completed',
                'results': output_files,
                'completedAt': firestore.SERVER_TIMESTAMP
            })
            return {'status': 'completed', 'results': output_files}

    except Exception as e:
        logging.error(f"Task {task_id} failed: {e}")
        db.collection('tasks').document(task_id).update({'status': 'failed', 'error': str(e)})
        raise
