export const ALLOWED_RECORDING_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/webm',
]);

export const RECORDING_MIME_TO_EXTENSION: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/webm': '.webm',
};

export const DEFAULT_MAX_RECORDING_BYTES = 200 * 1024 * 1024;
