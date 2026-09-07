import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { FileFilterCallback } from 'multer';
import { ALLOWED_RECORDING_MIME_TYPES } from './constants';

export function recordingFileFilter(
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback,
): void {
  if (!ALLOWED_RECORDING_MIME_TYPES.has(file.mimetype)) {
    callback(new BadRequestException(`Unsupported file type: ${file.mimetype}`));
    return;
  }
  callback(null, true);
}
