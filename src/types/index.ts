export type UserRole = 'superadmin' | 'organizer';
export type UserStatus = 'active' | 'disabled';
export type EventStatus = 'active' | 'disabled';
export type MediaType = 'image' | 'video';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  assignedEventIds: string[];
  initialPassword?: string;
  authMethod?: 'password' | 'google';
  createdAt: string;
  updatedAt?: string;
}

export interface EventItem {
  id: string;
  name: string;
  description: string;
  date: string;
  location: string;
  bannerUrl: string;
  publicToken: string;
  organizerIds: string[];
  organizerEmails?: string[];
  status: EventStatus;
  maxFilesPerGuest: number;
  maxFileSizeMb: number;
  allowedTypes: string[];
  uploadsCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UploadItem {
  id: string;
  eventId: string;
  publicToken: string;
  storagePath: string;
  downloadUrl: string;
  fileName: string;
  safeDisplayName: string;
  mediaType: MediaType;
  mimeType: string;
  fileSize: number;
  uploaderSessionId: string;
  guestName?: string;
  status: 'completed' | 'processing';
  createdAt: string;
}

export interface QueuedUploadFile {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: MediaType;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

export const INFINITE_FILES_VAL = 1000000;
export const MAX_FILES_OPTIONS = [0, 50, 100, 200, 300, 400, 500, INFINITE_FILES_VAL] as const;

export function formatMaxFiles(limit: number): string {
  if (limit === undefined || limit === null) return '100';
  if (limit >= INFINITE_FILES_VAL) return '∞';
  return String(limit);
}

