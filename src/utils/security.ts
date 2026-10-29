export function generateUnguessableToken(length = 24): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

export function sanitizeFileName(name: string): string {
  if (!name) return 'media_item';
  // Remove directory traversal & problematic characters
  const clean = name
    .replace(/^.*[\\/]/, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
  return clean || 'media_item';
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function isAllowedMediaType(file: File, allowedTypes: string[]): boolean {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  const isImage = mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|heif|gif)$/i.test(name);
  const isVideo = mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(name);

  if (allowedTypes.includes('image') && isImage) return true;
  if (allowedTypes.includes('video') && isVideo) return true;

  return false;
}

export function validateFileSelection(
  file: File,
  maxSizeMb: number,
  allowedTypes: string[]
): { valid: boolean; error?: string } {
  if (!isAllowedMediaType(file, allowedTypes)) {
    return {
      valid: false,
      error: `Unsupported file type "${file.name}". Only photos and videos are accepted.`
    };
  }

  const maxBytes = maxSizeMb * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds the ${maxSizeMb} MB limit (${formatBytes(file.size)}).`
    };
  }

  return { valid: true };
}
