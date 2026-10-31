import fs from 'node:fs/promises';
import { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { CreditTransaction, Dataset, MediaAsset, User } from '../models';

export class InsufficientCreditError extends Error {
  constructor(message = 'Insufficient credit for this upload.') {
    super(message);
    this.name = 'InsufficientCreditError';
  }
}

export class InvalidMediaFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMediaFileError';
  }
}

async function verifyFileSignature(file: Express.Multer.File, kind: 'image' | 'video'): Promise<void> {
  if (file.originalname.trim().length === 0 || file.originalname.length > 255) {
    throw new InvalidMediaFileError('File name must contain 1 to 255 characters.');
  }
  const handle = await fs.open(file.path, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isWebp = bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    const isMp4 = bytes.length >= 8 && bytes.toString('ascii', 4, 8) === 'ftyp';
    if (kind === 'image' ? !(isJpeg || isPng || isWebp) : !isMp4) {
      throw new InvalidMediaFileError('The file content does not match an accepted image or MP4 format.');
    }
  } finally {
    await handle.close();
  }
}

export async function chargeAndSaveAsset(
  dataset: Dataset,
  file: Express.Multer.File,
  kind: 'image' | 'video',
): Promise<{ asset: MediaAsset; cost: number }> {
  const cost = kind === 'image' ? 0.25 : Number(((file.size / 1024) * 0.08).toFixed(4));
  try {
    await verifyFileSignature(file, kind);
    const asset = await sequelize.transaction(async (transaction: Transaction) => {
      // Lock the balance row so concurrent uploads cannot both spend the same credits.
      const user = await User.findByPk(dataset.ownerId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!user || Number(user.creditBalance) < cost) throw new InsufficientCreditError();
      user.creditBalance = Number(user.creditBalance) - cost;
      await user.save({ transaction });

      const saved = await MediaAsset.create({
        datasetId: dataset.id,
        kind,
        storagePath: file.path,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      }, { transaction });
      await CreditTransaction.create({
        userId: user.id,
        kind: 'UPLOAD',
        amount: -cost,
        referenceId: saved.id,
        description: `${kind} upload: ${file.originalname}`,
      }, { transaction });
      return saved;
    });
    return { asset, cost };
  } catch (error) {
    await fs.rm(file.path, { force: true }).catch(() => undefined);
    throw error;
  }
}
