"""Create small, synthetic media files for the Postman demo."""

from pathlib import Path
import sys

import cv2
import numpy as np


def draw_scene(frame, frame_number: int = 0) -> None:
    height, width = frame.shape[:2]
    frame[:] = (238, 242, 246)
    cv2.rectangle(frame, (0, int(height * 0.72)), (width, height), (105, 145, 82), -1)
    x = int(width * 0.15 + (frame_number % 24) * width * 0.025)
    y = int(height * 0.55)
    cv2.rectangle(frame, (x, y - 70), (x + 80, y), (38, 86, 194), -1)
    cv2.circle(frame, (x + 16, y + 2), 12, (30, 30, 30), -1)
    cv2.circle(frame, (x + 64, y + 2), 12, (30, 30, 30), -1)
    cv2.putText(frame, "SYNTHETIC DEMO", (16, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (30, 30, 30), 2)


def main() -> None:
    output_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/vision-inference-samples")
    output_dir.mkdir(parents=True, exist_ok=True)

    image = np.zeros((360, 640, 3), dtype=np.uint8)
    draw_scene(image)
    image_path = output_dir / "sample-image.jpg"
    if not cv2.imwrite(str(image_path), image):
        raise RuntimeError("Could not write sample-image.jpg")

    video_path = output_dir / "sample-video.mp4"
    writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 12.0, (640, 360))
    if not writer.isOpened():
        raise RuntimeError("This OpenCV build cannot encode MP4 with the mp4v codec.")
    try:
        for frame_number in range(24):
            frame = np.zeros((360, 640, 3), dtype=np.uint8)
            draw_scene(frame, frame_number)
            writer.write(frame)
    finally:
        writer.release()

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened() or int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) != 24:
        capture.release()
        raise RuntimeError("Generated MP4 could not be validated as a 24-frame video.")
    capture.release()
    print(f"Generated {image_path} and {video_path} (24-frame synthetic MP4).")


if __name__ == "__main__":
    main()
