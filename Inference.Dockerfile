FROM python:3.11-slim
WORKDIR /service
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY inference/requirements.txt ./requirements.txt
# YOLO runs on CPU in this project; use CPU-only PyTorch wheels to avoid CUDA libraries.
RUN pip install --no-cache-dir --default-timeout=1000 --retries=10 \
    --index-url https://download.pytorch.org/whl/cpu torch torchvision
RUN pip install --no-cache-dir --default-timeout=1000 --retries=10 -r requirements.txt
COPY inference/app.py ./app.py
COPY inference/generate_sample_media.py ./generate_sample_media.py
ENV UPLOAD_DIR=/app/uploads
ENV YOLO_MODEL=yolo11n.pt
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
