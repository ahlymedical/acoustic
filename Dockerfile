# الخطوة 1: استخدم إصدار بايثون مستقر ومتوافق
FROM python:3.9-slim

# الخطوة 2: قم بتعيين متغيرات البيئة
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=off

# الخطوة 3: تثبيت الأدوات الأساسية المطلوبة مثل ffmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# الخطوة 4: إعداد مجلد العمل
WORKDIR /app

# الخطوة 5: نسخ ملف المكتبات وتثبيتها
COPY requirements.txt .
# تثبيت torch بشكل منفصل أولاً
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt

# الخطوة 6: نسخ جميع ملفات التطبيق إلى الحاوية
COPY . .

# الخطوة 7: نسخ وتحضير سكربت بدء التشغيل
COPY run.sh .
RUN chmod +x ./run.sh

# الخطوة 8: الأمر النهائي لتشغيل التطبيق عبر السكربت
CMD ["./run.sh"]
