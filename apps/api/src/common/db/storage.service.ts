import * as fs from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { uuid } from './database';

export const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

@Injectable()
export class StorageService {
  save(file: Express.Multer.File): string {
    const ext = path.extname(file.originalname || '') || '.bin';
    return this.saveBuffer(file.buffer, ext);
  }

  /**
   * Store bytes the server produced rather than bytes a user uploaded — the
   * photo inside an offline e-KYC pack, for instance. Same directory, same
   * `/uploads/<uuid>.<ext>` URL either way.
   */
  saveBuffer(buffer: Buffer, ext: string): string {
    const key = `${uuid()}${ext || '.bin'}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, key), buffer);
    return `/uploads/${key}`;
  }
}
