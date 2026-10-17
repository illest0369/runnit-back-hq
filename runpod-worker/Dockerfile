FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY runpod-worker/requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('tiny.en', device='cpu', compute_type='int8', download_root='/models')"

COPY runpod-worker/rbhq_runpod ./rbhq_runpod
COPY runpod-worker/handler.py ./handler.py

CMD ["python", "-u", "handler.py"]
