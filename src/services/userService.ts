import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { UserProfile, UserStatus } from '../types';
import { handleFirestoreError, OperationType } from '../firebase/errors';

async function getAuthHeaders(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchOrganizers(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const q = query(collection(db, path), where('role', '==', 'organizer'));
    const snapshot = await getDocs(q);
    const users: UserProfile[] = [];
    snapshot.forEach((d) => {
      users.push({ ...(d.data() as UserProfile), uid: d.id });
    });
    return users;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export interface CreateOrganizerParams {
  email: string;
  name: string;
  password?: string;
  assignedEventIds?: string[];
}

/**
 * Provisions organizer account via server endpoint with client fallback
 * Authorized by Super Admin role in firestore.rules
 */
export async function createOrganizer(params: CreateOrganizerParams): Promise<UserProfile> {
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = params.name.trim();
  const eventIds = params.assignedEventIds || [];
  const now = new Date().toISOString();
  let assignedUid = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/create-organizer', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.organizer?.uid) {
        assignedUid = data.organizer.uid;
      }
      if (!data.clientSyncRequired) {
        return {
          uid: assignedUid,
          email: cleanEmail,
          name: cleanName,
          role: 'organizer',
          status: 'active',
          assignedEventIds: eventIds,
          createdAt: now,
        };
      }
    }
  } catch (apiErr) {
    console.info('Server API create-organizer notice, persisting via client Firestore:', apiErr);
  }

  // Client-side persistence: super admin creates organizer profile in Firestore
  const profile: UserProfile = {
    uid: assignedUid,
    email: cleanEmail,
    name: cleanName,
    role: 'organizer',
    status: 'active',
    assignedEventIds: eventIds,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'users', assignedUid), profile);

    for (const evId of eventIds) {
      try {
        await updateDoc(doc(db, 'events', evId), {
          organizerIds: arrayUnion(assignedUid),
          updatedAt: now,
        });
      } catch (e) {
        console.warn('Event assignment notice:', e);
      }
    }

    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${assignedUid}`);
  }
}

/**
 * Updates organizer status via server-controlled endpoint with client fallback
 */
export async function updateOrganizerStatus(userId: string, status: UserStatus): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/admin/toggle-organizer', {
      method: 'POST',
      headers,
      body: JSON.stringify({ uid: userId, status }),
    });

    if (res.ok) return;
  } catch (apiErr) {
    console.warn('API toggle-organizer notice, falling back to direct write:', apiErr);
  }

  try {
    await updateDoc(doc(db, 'users', userId), {
      status,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
  }
}

/**
 * Deletes organizer account via server endpoint with client fallback
 */
export async function deleteOrganizer(userId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/delete-organizer/${userId}`, {
      method: 'DELETE',
      headers,
    });

    if (res.ok) return;
  } catch (apiErr) {
    console.warn('API delete-organizer notice, falling back to direct write:', apiErr);
  }

  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

export async function setOrganizerEventAssignments(
  userId: string,
  newEventIds: string[],
  previousEventIds: string[]
): Promise<void> {
  const path = `users/${userId}`;
  const now = new Date().toISOString();

  try {
    await updateDoc(doc(db, 'users', userId), {
      assignedEventIds: newEventIds,
      updatedAt: now,
    });

    // Remove from unassigned events
    const removedIds = previousEventIds.filter((id) => !newEventIds.includes(id));
    for (const evId of removedIds) {
      try {
        await updateDoc(doc(db, 'events', evId), {
          organizerIds: arrayRemove(userId),
          updatedAt: now,
        });
      } catch (e) {
        console.warn('Assignment remove error:', e);
      }
    }

    // Add to newly assigned events
    const addedIds = newEventIds.filter((id) => !previousEventIds.includes(id));
    for (const evId of addedIds) {
      try {
        await updateDoc(doc(db, 'events', evId), {
          organizerIds: arrayUnion(userId),
          updatedAt: now,
        });
      } catch (e) {
        console.warn('Assignment add error:', e);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
