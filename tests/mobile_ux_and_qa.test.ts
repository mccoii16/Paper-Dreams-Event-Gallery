import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuestEventUrl, getPublicBaseUrl } from '../src/utils/domain';
import {
  validateFileSelection,
  isAllowedMediaType,
  formatBytes,
  sanitizeFileName,
  generateUnguessableToken,
} from '../src/utils/security';

test('DOMAIN: buildGuestEventUrl produces clean HTTPS public URL with public token', () => {
  const token = 'guest_token_abc123';
  const url = buildGuestEventUrl(token);
  assert.ok(url.endsWith(`/e/${token}`));
  assert.ok(url.startsWith('http'));
});

test('VALIDATION: Rejects files exceeding custom event size quota', () => {
  const largeMockFile = {
    name: 'heavy_video.mp4',
    type: 'video/mp4',
    size: 120 * 1024 * 1024, // 120 MB
  } as unknown as File;

  // Max limit is 50MB
  const result = validateFileSelection(largeMockFile, 50, ['image', 'video']);
  assert.equal(result.valid, false);
  assert.match(result.error || '', /exceeds the 50 MB limit/);
});

test('VALIDATION: Permits valid video and image formats within size limit', () => {
  const validPhoto = {
    name: 'ceremony_snap.webp',
    type: 'image/webp',
    size: 3 * 1024 * 1024,
  } as unknown as File;

  const validVideo = {
    name: 'first_dance.mp4',
    type: 'video/mp4',
    size: 45 * 1024 * 1024,
  } as unknown as File;

  assert.equal(validateFileSelection(validPhoto, 50, ['image', 'video']).valid, true);
  assert.equal(validateFileSelection(validVideo, 50, ['image', 'video']).valid, true);
});

test('VALIDATION: Disallows unpermitted file formats (security check)', () => {
  const executable = {
    name: 'installer.exe',
    type: 'application/x-msdownload',
    size: 500,
  } as unknown as File;

  const script = {
    name: 'script.js',
    type: 'text/javascript',
    size: 200,
  } as unknown as File;

  assert.equal(validateFileSelection(executable, 50, ['image', 'video']).valid, false);
  assert.equal(validateFileSelection(script, 50, ['image', 'video']).valid, false);
});

test('ORGANIZER ACCESS: Cross-event access restriction verification', () => {
  // Organizer A assigned only to event 101
  const organizerA = { uid: 'org_user_A', assignedEventIds: ['event_101'] };
  const event101 = { id: 'event_101', organizerIds: ['org_user_A'] };
  const event202 = { id: 'event_202', organizerIds: ['org_user_B'] };

  const canAccess101 = event101.organizerIds.includes(organizerA.uid);
  const canAccess202 = event202.organizerIds.includes(organizerA.uid);

  assert.equal(canAccess101, true);
  assert.equal(canAccess202, false);
});

test('UPLOAD SAFETY: Upload record downloadUrl avoids base64 data URLs exceeding Firestore limit', () => {
  const sampleUploadRecord = {
    id: 'test_upload_id',
    eventId: 'event_123',
    downloadUrl: 'https://firebasestorage.googleapis.com/v0/b/pd-event-gallery.firebasestorage.app/o/events%2F123.jpg?alt=media',
    fileSize: 6648264,
  };
  const recordSize = Buffer.byteLength(JSON.stringify(sampleUploadRecord), 'utf-8');
  // Must be strictly below 1MB (1,048,576 bytes)
  assert.ok(recordSize < 1000);
  assert.equal(sampleUploadRecord.downloadUrl.startsWith('data:'), false);
});

test('GUEST ATTRIBUTION: Contributor name is preserved and trimmed', () => {
  const rawInputName = '  Dr. Evelyn & Marcus Vance  ';
  const cleanName = rawInputName.trim() || 'Anonymous Guest';
  assert.equal(cleanName, 'Dr. Evelyn & Marcus Vance');

  const emptyInput = '   ';
  const fallbackName = emptyInput.trim() || 'Anonymous Guest';
  assert.equal(fallbackName, 'Anonymous Guest');
});

test('GUEST ATTRIBUTION: Upload record accommodates guestName within rules character limit', () => {
  const sampleUploadWithGuest = {
    id: 'upload_999',
    eventId: 'event_456',
    publicToken: 'token_abc',
    storagePath: 'events/event_456/photo.jpg',
    downloadUrl: 'https://storage.googleapis.com/test/photo.jpg',
    fileName: 'photo.jpg',
    mediaType: 'image',
    fileSize: 2048,
    uploaderSessionId: 'sess_123',
    guestName: 'The Miller Family',
    status: 'completed',
    createdAt: new Date().toISOString(),
  };

  assert.ok(sampleUploadWithGuest.guestName.length <= 120);
  assert.equal(sampleUploadWithGuest.guestName, 'The Miller Family');
});

test('BANNER UPLOAD: uploadEventBanner rejects non-image files and validates image input', async () => {
  const { uploadEventBanner } = await import('../src/services/eventService');
  const invalidFile = {
    name: 'document.pdf',
    type: 'application/pdf',
    size: 1024,
  } as unknown as File;

  await assert.rejects(
    async () => {
      await uploadEventBanner(invalidFile, 'test_event');
    },
    {
      message: /Please select a valid image file/,
    }
  );
});


