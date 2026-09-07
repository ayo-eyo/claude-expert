import * as path from 'node:path';
import { rm } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RecordingsStorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = path.resolve(config.getOrThrow<string>('RECORDINGS_STORAGE_ROOT'));
  }

  private resolve(storagePath: string): string {
    const absolute = path.resolve(this.root, storagePath);
    if (absolute !== this.root && !absolute.startsWith(this.root + path.sep)) {
      throw new Error(`Refusing to access path outside of storage root: ${storagePath}`);
    }
    return absolute;
  }

  async remove(storagePath: string): Promise<void> {
    await rm(this.resolve(storagePath), { force: true });
  }
}
