import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  increment,
} from 'firebase/firestore';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { db, storage, auth } from '../firebase/config';
import { EventItem, UploadItem, MediaType } from '../types';
import { generateUnguessableToken, sanitizeFileName } from '../utils/security';
import { handleFirestoreError, OperationType } from '../firebase/errors';

export const DEFAULT_BANNERS = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1600&q=80', // Elegant wedding flowers
  'https://images.unsplash.com/photo-1469371670807-013ccf25f16a?auto=format&fit=crop&w=1600&q=80', // Golden hour celebration
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1600&q=80', // Toasting champagne glasses
  'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1600&q=80', // Outdoor evening banquet
  'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&w=1600&q=80', // Modern party gathering
];

export interface CreateEventParams {
  name: string;
  description: string;
  date: string;
  location: string;
  bannerUrl: string;
  organizerIds: string[];
  maxFilesPerGuest: number;
  maxFileSizeMb: number;
  allowedTypes: string[];
  createdBy: string;
}

export async function createEvent(params: CreateEventParams): Promise<string> {
  const publicToken = generateUnguessableToken(24);
  const eventId = generateUnguessableToken(16);
  const now = new Date().toISOString();

  const newEvent: EventItem = {
    id: eventId,
    name: params.name.trim(),
    description: (params.description || '').trim(),
    date: params.date || '',
    location: (params.location || '').trim(),
    bannerUrl: params.bannerUrl || DEFAULT_BANNERS[0],
    publicToken,
    organizerIds: params.organizerIds || [],
    status: 'active',
    maxFilesPerGuest: params.maxFilesPerGuest || 30,
    maxFileSizeMb: params.maxFileSizeMb || 50,
    allowedTypes: params.allowedTypes?.length ? params.allowedTypes : ['image', 'video'],
    uploadsCount: 0,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const eventRef = doc(db, 'events', eventId);
    await setDoc(eventRef, newEvent);
    return eventId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `events/${eventId}`);
  }
}

export async function updateEvent(
  eventId: string,
  updates: Partial<EventItem>
): Promise<void> {
  try {
    const eventRef = doc(db, 'events', eventId);
    const cleanUpdates = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await updateDoc(eventRef, cleanUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `events/${eventId}`);
  }
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function deleteEvent(eventId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/delete-event/${eventId}`, {
      method: 'DELETE',
      headers,
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn('API delete-event notice, falling back to direct operation:', apiErr);
  }

  try {
    // Delete event document
    await deleteDoc(doc(db, 'events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
  }
}

export async function getEventByToken(publicToken: string): Promise<EventItem | null> {
  const path = 'events';
  try {
    const q = query(
      collection(db, path),
      where('publicToken', '==', publicToken),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    const docData = snapshot.docs[0].data() as EventItem;
    return { ...docData, id: snapshot.docs[0].id };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getEventById(eventId: string): Promise<EventItem | null> {
  const path = `events/${eventId}`;
  try {
    const snap = await getDoc(doc(db, 'events', eventId));
    if (!snap.exists()) return null;
    return { ...(snap.data() as EventItem), id: snap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeEvents(
  userId: string,
  isAdmin: boolean,
  callback: (events: EventItem[]) => void
): () => void {
  const path = 'events';
  let q;
  if (isAdmin) {
    q = query(collection(db, path));
  } else {
    q = query(collection(db, path), where('organizerIds', 'array-contains', userId));
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const events: EventItem[] = [];
      snapshot.forEach((d) => {
        events.push({ ...(d.data() as EventItem), id: d.id });
      });
      // Sort newest first
      events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(events);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeEventUploads(
  eventId: string,
  callback: (uploads: UploadItem[]) => void
): () => void {
  const path = 'uploads';
  const q = query(collection(db, path), where('eventId', '==', eventId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: UploadItem[] = [];
      snapshot.forEach((d) => {
        items.push({ ...(d.data() as UploadItem), id: d.id });
      });
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function deleteUpload(uploadId: string, storagePath: string, eventId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/media/delete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ uploadId }),
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn('API media/delete notice, falling back to direct operation:', apiErr);
  }

  try {
    if (storagePath) {
      try {
        await deleteObject(ref(storage, storagePath));
      } catch (storageErr) {
        console.warn('Storage file deletion note:', storageErr);
      }
    }
    await deleteDoc(doc(db, 'uploads', uploadId));

    try {
      const eventRef = doc(db, 'events', eventId);
      await updateDoc(eventRef, {
        uploadsCount: increment(-1),
      });
    } catch (e) {
      console.warn('Upload count decrement non-critical error:', e);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `uploads/${uploadId}`);
  }
}

export interface UploadGuestFileParams {
  eventId: string;
  publicToken: string;
  file: File;
  uploaderSessionId: string;
  guestName?: string;
  onProgress?: (percent: number) => void;
}

export async function uploadMediaViaServerFallback(
  eventId: string,
  uploadId: string,
  safeName: string,
  file: File,
  guestName?: string
): Promise<string> {
  const query = new URLSearchParams({
    eventId,
    uploadId,
    safeName,
    ...(guestName ? { guestName } : {}),
  });
  const res = await fetch(`/api/media/upload?${query.toString()}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Server media upload fallback failed: ${txt}`);
  }
  const data = await res.json();
  return data.downloadUrl;
}

export async function uploadGuestMedia(params: UploadGuestFileParams): Promise<UploadItem> {
  const { eventId, publicToken, file, uploaderSessionId, guestName, onProgress } = params;
  const uploadId = generateUnguessableToken(20);
  const safeName = sanitizeFileName(file.name);
  const mediaType: MediaType = file.type.startsWith('video/') ? 'video' : 'image';
  const timestamp = Date.now();
  const storagePath = `events/${eventId}/${timestamp}_${uploadId}_${safeName}`;
  const cleanGuestName = (guestName || '').trim() || 'Anonymous Guest';

  let downloadUrl = '';

  try {
    // Attempt Firebase Storage resumable upload
    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        eventId,
        publicToken,
        uploaderSessionId,
        guestName: cleanGuestName,
      },
    });

    await new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress?.(progress);
        },
        (error) => {
          reject(error);
        },
        async () => {
          try {
            downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve();
          } catch {
            // Direct storage public download URL fallback
            const bucketName = storage.app.options.storageBucket || 'pd-event-gallery.firebasestorage.app';
            downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
            resolve();
          }
        }
      );
    });
  } catch (storageError) {
    console.warn('Direct client storage upload failed, utilizing resilient server upload pipeline:', storageError);
    try {
      downloadUrl = await uploadMediaViaServerFallback(eventId, `${timestamp}_${uploadId}`, safeName, file, cleanGuestName);
      onProgress?.(100);
    } catch (fallbackError) {
      console.error('All upload storage attempts encountered error:', fallbackError);
      throw new Error(fallbackError instanceof Error ? fallbackError.message : 'Media upload failed. Please try again.');
    }
  }

  // Guaranteed safety: ensure downloadUrl is never a base64 string that blows past Firestore limits
  if (!downloadUrl || downloadUrl.startsWith('data:')) {
    const bucketName = storage.app.options.storageBucket || 'pd-event-gallery.firebasestorage.app';
    downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(storagePath)}?alt=media`;
  }

  const uploadRecord: UploadItem = {
    id: uploadId,
    eventId,
    publicToken,
    storagePath,
    downloadUrl,
    fileName: safeName,
    safeDisplayName: safeName.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
    mediaType,
    mimeType: file.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
    fileSize: file.size,
    uploaderSessionId,
    guestName: cleanGuestName,
    status: 'completed',
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'uploads', uploadId), uploadRecord);
    try {
      await updateDoc(doc(db, 'events', eventId), {
        uploadsCount: increment(1),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Could not increment uploadsCount directly:', e);
    }
    return uploadRecord;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `uploads/${uploadId}`);
  }
}
