from pathlib import Path
from typing import Literal
import os

import cv2
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from ultralytics import YOLO

app = FastAPI(title='YOLO inference service')
ROOT = Path(os.getenv('UPLOAD_DIR', '/app/uploads')).resolve()
MODEL_NAME = os.getenv('YOLO_MODEL', 'yolo11n.pt')
_model = None

class Asset(BaseModel):
    id: str
    path: str
    kind: Literal['image', 'video']

class ProbeRequest(BaseModel):
    assets: list[Asset]

class InferRequest(BaseModel):
    jobId: str
    modelId: str
    assets: list[Asset]

class FrameRequest(BaseModel):
    assetPath: str
    assetKind: Literal['image', 'video']
    frameNumber: int
    annotatedFile: str


def resolve_upload(path: str) -> Path:
    # Never let an API or queue payload make the inference service read outside its shared volume.
    candidate = Path(path).resolve()
    if not candidate.is_relative_to(ROOT):
        raise HTTPException(status_code=400, detail='File path is outside the shared upload directory.')
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail='Uploaded file was not found.')
    return candidate


def get_model():
    global _model
    if _model is None:
        _model = YOLO(MODEL_NAME)
    return _model


def read_detections(result):
    detections = []
    if result.boxes is None:
        return detections
    boxes = result.boxes.xyxy.cpu().tolist()
    classes = result.boxes.cls.cpu().tolist()
    confidences = result.boxes.conf.cpu().tolist()
    names = result.names
    for box, class_id, confidence in zip(boxes, classes, confidences):
        detections.append({
            'classId': int(class_id),
            'className': names[int(class_id)],
            'confidence': float(confidence),
            'bbox': {'x1': box[0], 'y1': box[1], 'x2': box[2], 'y2': box[3]},
        })
    return detections

@app.get('/health')
def health():
    return {'status': 'ok'}

@app.post('/probe')
def probe(request: ProbeRequest):
    results = []
    for asset in request.assets:
        source = resolve_upload(asset.path)
        if asset.kind == 'image':
            frame_count = 1
        else:
            capture = cv2.VideoCapture(str(source))
            if not capture.isOpened():
                raise HTTPException(status_code=400, detail=f'Cannot open video {asset.id}.')
            frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            capture.release()
            if frame_count < 1:
                raise HTTPException(status_code=400, detail=f'Video {asset.id} contains no readable frames.')
        results.append({'assetId': asset.id, 'frameCount': frame_count})
    return {'assets': results}

@app.post('/infer')
def infer(request: InferRequest):
    if request.modelId not in ('yolo11n', 'yolo11n.pt'):
        raise HTTPException(status_code=400, detail='This service supports the yolo11n model only.')
    model = get_model()
    job_dir = ROOT / 'results' / request.jobId
    output = []
    for asset in request.assets:
        source = resolve_upload(asset.path)
        asset_dir = job_dir / asset.id
        asset_dir.mkdir(parents=True, exist_ok=True)
        frame_count = 0
        for frame_number, result in enumerate(model.predict(source=str(source), stream=True, verbose=False, save=False)):
            annotated = result.plot()
            annotated_path = asset_dir / f'{frame_number:08d}.jpg'
            if not cv2.imwrite(str(annotated_path), annotated):
                raise HTTPException(status_code=500, detail='Could not save annotated frame.')
            output.append({
                'assetId': asset.id,
                # Images have one result and use frame 0; videos preserve their decoded frame index.
                'frameNumber': frame_number if asset.kind == 'video' else 0,
                'detections': read_detections(result),
                'annotatedFile': str(annotated_path.relative_to(ROOT)),
            })
            frame_count += 1
        if frame_count == 0:
            raise HTTPException(status_code=400, detail=f'No frames were processed for asset {asset.id}.')
    return {'modelId': request.modelId, 'frames': output}

@app.post('/frame')
def frame(request: FrameRequest):
    if request.frameNumber < 0:
        raise HTTPException(status_code=400, detail='Frame number cannot be negative.')
    original_path = resolve_upload(request.assetPath)
    annotated_path = resolve_upload(str(ROOT / request.annotatedFile))
    if request.assetKind == 'image':
        original = cv2.imread(str(original_path))
    else:
        capture = cv2.VideoCapture(str(original_path))
        capture.set(cv2.CAP_PROP_POS_FRAMES, request.frameNumber)
        success, original = capture.read()
        capture.release()
        if not success:
            raise HTTPException(status_code=404, detail='Original video frame was not found.')
    annotated = cv2.imread(str(annotated_path))
    if original is None or annotated is None:
        raise HTTPException(status_code=404, detail='Original or annotated image was not found.')
    height = min(original.shape[0], annotated.shape[0])
    def scale(image):
        width = max(1, round(image.shape[1] * height / image.shape[0]))
        return cv2.resize(image, (width, height))
    side_by_side = cv2.hconcat([scale(original), scale(annotated)])
    ok, encoded = cv2.imencode('.jpg', side_by_side)
    if not ok:
        raise HTTPException(status_code=500, detail='Could not encode the result image.')
    return Response(content=encoded.tobytes(), media_type='image/jpeg')
