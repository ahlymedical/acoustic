import os
import logging
from flask import Flask, render_template, request, jsonify, g
from werkzeug.utils import secure_filename
from google.cloud import storage, secretmanager
import firebase_admin
from firebase_admin import auth, credentials, firestore
from celery_worker import process_audio_task
from flask_babel import Babel, gettext as _
from functools import wraps
import json

# --- الإعدادات الأساسية ---
logging.basicConfig(level=logging.INFO)
app = Flask(__name__)

# --- إعدادات i18n (متعدد اللغات) ---
app.config['BABEL_DEFAULT_LOCALE'] = 'ar'
babel = Babel(app)

@babel.localeselector
def get_locale():
    return request.accept_languages.best_match(['ar', 'en'])

# --- إعداد Firebase و GCS ---
# تم تحديث معرف المشروع الاحتياطي هنا
project_id = os.environ.get('GCP_PROJECT', 'lana-472315') 

def get_secret(secret_id, version_id="latest"):
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{project_id}/secrets/{secret_id}/versions/{version_id}"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("UTF-8")

if not firebase_admin._apps:
    try:
        firebase_credentials_json = get_secret("firebase-credentials")
        cred = credentials.Certificate(json.loads(firebase_credentials_json))
        firebase_admin.initialize_app(cred)
    except Exception as e:
        logging.error(f"Could not initialize Firebase: {e}")

db = firestore.client()
storage_client = storage.Client()
BUCKET_NAME = os.environ.get('GCS_BUCKET_NAME', 'audio-processing-bucket-12345')
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- Middleware للمصادقة ---
@app.before_request
def verify_user():
    g.user = None
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    if id_token:
        try:
            g.user = auth.verify_id_token(id_token)
        except Exception as e:
            logging.warning(f"Invalid token: {e}")
            g.user = None

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if g.user is None:
            return jsonify({"error": _("Authentication required")}), 401
        return f(*args, **kwargs)
    return decorated_function

# --- الواجهات ---
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/process', methods=['POST'])
@require_auth
def start_processing():
    if 'audio_file' not in request.files:
        return jsonify({"error": _("No file sent")}), 400
    
    file = request.files['audio_file']
    operation = request.form.get('operation')
    
    if not operation or file.filename == '' or not allowed_file(file.filename):
        return jsonify({"error": _("Invalid file or operation")}), 400

    try:
        user_id = g.user['uid']
        filename = secure_filename(file.filename)
        
        gcs_path = f"uploads/{user_id}/{filename}"
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(gcs_path)
        blob.upload_from_file(file.stream)
        
        options = {}
        if operation == 'separate':
            stems = request.form.getlist('stems')
            if stems:
                options['stems'] = stems

        task_data = {
            'user_id': user_id,
            'gcs_input_path': gcs_path,
            'operation': operation,
            'options': options
        }
        
        task = process_audio_task.delay(task_data)
        
        return jsonify({"message": _("Processing started"), "task_id": task.id}), 202

    except Exception as e:
        logging.error(f"Error starting task: {e}")
        return jsonify({"error": _("Error starting processing")}), 500

@app.route('/task_status/<task_id>', methods=['GET'])
@require_auth
def get_task_status(task_id):
    user_id = g.user['uid']
    doc_ref = db.collection('tasks').document(task_id)
    doc = doc_ref.get()

    if not doc.exists or doc.to_dict().get('userId') != user_id:
        return jsonify({"error": _("Task not found")}), 404
        
    return jsonify(doc.to_dict())

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port, debug=True)
