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
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { initializeApp as initSecondaryApp, getApps as getClientApps, getApp as getClientApp } from 'firebase/app';
import { getAuth as getSecondaryAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { db, auth, resolvedFirebaseConfig } from '../firebase/config';
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

  const cleanPassword = params.password?.trim() || '';

  // Client-side Firebase Auth account provisioning if password provided
  if (cleanPassword) {
    try {
      let secondaryApp;
      const appName = 'PaperDreamsSecondaryProvisioner';
      if (getClientApps().some((a) => a.name === appName)) {
        secondaryApp = getClientApp(appName);
      } else {
        secondaryApp = initSecondaryApp(resolvedFirebaseConfig, appName);
      }
      const secondaryAuth = getSecondaryAuth(secondaryApp);
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, cleanPassword);
      if (userCred.user?.uid) {
        assignedUid = userCred.user.uid;
      }
      await secondarySignOut(secondaryAuth);
    } catch (authErr: unknown) {
      const errCode = (authErr as { code?: string })?.code;
      if (errCode === 'auth/email-already-in-use') {
        console.info('Email already registered in Firebase Auth; linking profile directly.');
      } else {
        console.warn('Firebase Auth user creation notice:', authErr);
      }
    }
  }

  // Client-side persistence: super admin creates organizer profile in Firestore
  const profile: UserProfile = {
    uid: assignedUid,
    email: cleanEmail,
    name: cleanName,
    role: 'organizer',
    status: 'active',
    assignedEventIds: eventIds,
    initialPassword: cleanPassword || undefined,
    authMethod: cleanPassword ? 'password' : 'google',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'users', assignedUid), profile);

    for (const evId of eventIds) {
      try {
        await updateDoc(doc(db, 'events', evId), {
          organizerIds: arrayUnion(assignedUid),
          organizerEmails: arrayUnion(cleanEmail),
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
  // Read user profile first to clean up assignments
  let userEmail = '';
  let assignedIds: string[] = [];
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (userSnap.exists()) {
      const data = userSnap.data() as UserProfile;
      userEmail = (data.email || '').trim().toLowerCase();
      assignedIds = data.assignedEventIds || [];
    }
  } catch (readErr) {
    console.warn('Read user profile for delete cleanup notice:', readErr);
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/delete-organizer/${userId}`, {
      method: 'DELETE',
      headers,
    });

    if (res.ok) return;
  } catch {
    // API notice handled, proceeding to client fallback
  }

  try {
    // Clean up event organizerIds and organizerEmails
    for (const evId of assignedIds) {
      try {
        const updatePayload: Record<string, any> = {
          organizerIds: arrayRemove(userId),
          updatedAt: new Date().toISOString(),
        };
        if (userEmail) {
          updatePayload.organizerEmails = arrayRemove(userEmail);
        }
        await updateDoc(doc(db, 'events', evId), updatePayload);
      } catch (evErr) {
        console.warn('Event cleanup error:', evErr);
      }
    }

    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

export async function setOrganizerEventAssignments(
  userId: string,
  newEventIds: string[],
  previousEventIds: string[],
  userEmail?: string
): Promise<void> {
  const path = `users/${userId}`;
  const now = new Date().toISOString();
  const cleanEmail = userEmail?.trim().toLowerCase();

  try {
    await updateDoc(doc(db, 'users', userId), {
      assignedEventIds: newEventIds,
      updatedAt: now,
    });

    // Remove from unassigned events
    const removedIds = previousEventIds.filter((id) => !newEventIds.includes(id));
    for (const evId of removedIds) {
      try {
        const updatePayload: Record<string, any> = {
          organizerIds: arrayRemove(userId),
          updatedAt: now,
        };
        if (cleanEmail) {
          updatePayload.organizerEmails = arrayRemove(cleanEmail);
        }
        await updateDoc(doc(db, 'events', evId), updatePayload);
      } catch (e) {
        console.warn('Assignment remove error:', e);
      }
    }

    // Add to newly assigned events
    const addedIds = newEventIds.filter((id) => !previousEventIds.includes(id));
    for (const evId of addedIds) {
      try {
        const updatePayload: Record<string, any> = {
          organizerIds: arrayUnion(userId),
          updatedAt: now,
        };
        if (cleanEmail) {
          updatePayload.organizerEmails = arrayUnion(cleanEmail);
        }
        await updateDoc(doc(db, 'events', evId), updatePayload);
      } catch (e) {
        console.warn('Assignment add error:', e);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
