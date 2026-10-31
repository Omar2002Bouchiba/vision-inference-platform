import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { randomUUID } from 'node:crypto';

const root = path.resolve(process.env.UPLOAD_DIR ?? 'uploads');
fs.mkdirSync(root, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, callback) => {
    const dir = path.join(root, req.auth!.id, req.params.datasetId);
    fs.mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename: (_req, file, callback) => {
    const extensionByMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
    };
    callback(null, `${randomUUID()}${extensionByMime[file.mimetype]}`);
  },
});

function allowedType(kind: 'image' | 'video'): multer.Options['fileFilter'] {
  return (_req, file, callback) => {
    const accepted = kind === 'image'
      ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      : file.mimetype === 'video/mp4' && path.extname(file.originalname).toLowerCase() === '.mp4';
    if (!accepted) {
      callback(Object.assign(new Error(kind === 'image' ? 'Only JPEG, PNG, or WebP images are accepted.' : 'Only MP4 videos are accepted.'), { status: 400 }));
      return;
    }
    callback(null, true);
  };
}

const limits = { fileSize: 250 * 1024 * 1024, files: 1 };
export const imageUpload = multer({ storage, limits, fileFilter: allowedType('image') }).single('file');
export const videoUpload = multer({ storage, limits, fileFilter: allowedType('video') }).single('file');
export const uploadRootPath = root;
