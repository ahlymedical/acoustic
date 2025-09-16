#!/bin/bash

# Start Celery worker in the background
celery -A celery_worker.celery_app worker --loglevel=info &

# Start Gunicorn server in the foreground
exec gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 0 app:app
