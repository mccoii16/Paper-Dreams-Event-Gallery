import test from 'node:test';
import assert from 'node:assert/strict';
import { generateUnguessableToken, sanitizeFileName, formatBytes, isAllowedMediaType, validateFileSelection } from './security';

test('generateUnguessableToken creates unique tokens matching character set and length', () => {
  const token1 = generateUnguessableToken(24);
  const token2 = generateUnguessableToken(24);
  assert.equal(token1.length, 24);
  assert.equal(token2.length, 24);
  assert.notEqual(token1, token2);
  assert.match(token1, /^[a-zA-Z0-9]+$/);
});

test('sanitizeFileName removes directory paths and malicious chars', () => {
  assert.equal(sanitizeFileName('../../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFileName('my photo & wedding #1!?.jpg'), 'my_photo___wedding__1__.jpg');
  assert.equal(sanitizeFileName(''), 'media_item');
});

test('formatBytes formats file sizes accurately', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1024 * 1024 * 5), '5 MB');
});

test('validateFileSelection validates media types and sizes', () => {
  // Mock File-like object
  const validImage = {
    name: 'wedding_photo.jpg',
    type: 'image/jpeg',
    size: 2 * 1024 * 1024,
  } as unknown as File;

  const validResult = validateFileSelection(validImage, 25, ['image', 'video']);
  assert.equal(validResult.valid, true);

  const oversizedImage = {
    name: 'huge_photo.jpg',
    type: 'image/jpeg',
    size: 50 * 1024 * 1024,
  } as unknown as File;

  const oversizedResult = validateFileSelection(oversizedImage, 25, ['image', 'video']);
  assert.equal(oversizedResult.valid, false);
  assert.match(oversizedResult.error || '', /exceeds the 25 MB limit/);

  const forbiddenFile = {
    name: 'malware.exe',
    type: 'application/x-msdownload',
    size: 1024,
  } as unknown as File;

  const forbiddenResult = validateFileSelection(forbiddenFile, 25, ['image', 'video']);
  assert.equal(forbiddenResult.valid, false);
});
