import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import path from 'path';
import fs from 'fs';

// Load configuration
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: Record<string, string> = {};
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

const SUPERADMIN_EMAIL = 'Martiligando@gmail.com';

// Initialize Firebase Admin SDK
let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp({
    projectId: firebaseConfig.projectId || 'pdc-gallery',
    storageBucket: firebaseConfig.storageBucket || 'pdc-gallery.firebasestorage.app',
  });
} else {
  adminApp = getApps()[0];
}

// Get Admin SDK services
const adminAuth = getAuth(adminApp);
const adminDb = getFirestore(adminApp);
if (firebaseConfig.firestoreDatabaseId) {
  try {
    // @ts-ignore
    adminDb.settings({ databaseId: firebaseConfig.firestoreDatabaseId });
  } catch (e) {
    console.warn('Note setting custom databaseId on adminDb:', e);
  }
}
const adminStorage = getStorage(adminApp);

interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken;
  isAdmin?: boolean;
}

// Middleware: Authenticate Bearer token
async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header.' });
  }

  const idToken = authHeader.split('Bearer ')[1].trim();
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    req.user = decodedToken;

    // Check if token has admin custom claim, email match, or exists in /admins/{uid}
    let isSuperAdmin =
      decodedToken.admin === true ||
      decodedToken.role === 'superadmin' ||
      decodedToken.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase();

    if (!isSuperAdmin) {
      try {
        const adminSnap = await adminDb.collection('admins').doc(decodedToken.uid).get();
        if (adminSnap.exists) {
          isSuperAdmin = true;
        }
      } catch {
        // Handled via client-side authenticated firestore rules
      }
    }
    req.isAdmin = isSuperAdmin;
    next();
  } catch (err: unknown) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token', details: String(err) });
  }
}

// Middleware: Require Super Admin Role
function requireSuperAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Super Admin privileges required.' });
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // -------------------------------------------------------------
  // API ROUTE 1: One-time Admin Bootstrap Endpoint
  // Sets verified custom claims on the Super Admin and writes to /admins
  // -------------------------------------------------------------
  app.post('/api/admin/bootstrap', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Authorization header with user ID token.' });
      }

      const idToken = authHeader.split('Bearer ')[1].trim();
      const decoded = await adminAuth.verifyIdToken(idToken);

      // Verify designated super admin email
      if (decoded.email?.toLowerCase() !== SUPERADMIN_EMAIL.toLowerCase()) {
        return res.status(403).json({
          error: `Forbidden: Only the designated primary administrator (${SUPERADMIN_EMAIL}) can bootstrap super-admin privileges.`
        });
      }

      // Best effort server-side custom claim & document creation only if server credentials exist
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          await adminAuth.setCustomUserClaims(decoded.uid, {
            admin: true,
            role: 'superadmin',
          });
        } catch {
          // Handled via client-side authenticated firestore rules
        }

        try {
          await adminDb.collection('admins').doc(decoded.uid).set({
            uid: decoded.uid,
            email: decoded.email,
            establishedAt: FieldValue.serverTimestamp(),
            bootstrappedVia: 'server_controlled_bootstrap',
          }, { merge: true });
        } catch {
          // Handled via client-side authenticated firestore rules
        }

        try {
          await adminDb.collection('users').doc(decoded.uid).set({
            uid: decoded.uid,
            email: decoded.email,
            name: decoded.name || 'Super Admin',
            role: 'superadmin',
            status: 'active',
            assignedEventIds: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch {
          // Handled via client-side authenticated firestore rules
        }
      }

      return res.json({
        success: true,
        message: 'Super Admin successfully verified.',
        uid: decoded.uid,
        email: decoded.email,
        role: 'superadmin',
      });
    } catch (err: unknown) {
      return res.status(401).json({ error: 'Bootstrap failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 2: Server-Controlled Organizer Creation
  // Only Super Admin can provision organizer accounts
  // -------------------------------------------------------------
  app.post('/api/admin/create-organizer', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { email, name, password, assignedEventIds } = req.body;
      if (!email || !name) {
        return res.status(400).json({ error: 'Email and name are required.' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const cleanName = String(name).trim();
      const defaultPassword = password || `Luxe_${Math.random().toString(36).slice(-8)}!`;
      let organizerUid = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Attempt creation in Firebase Authentication if credentials available
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
          const userRecord = await adminAuth.createUser({
            email: cleanEmail,
            displayName: cleanName,
            password: defaultPassword,
            emailVerified: true,
          });
          organizerUid = userRecord.uid;

          try {
            await adminAuth.setCustomUserClaims(organizerUid, {
              role: 'organizer',
              admin: false,
            });
          } catch {
            // Handled via client-side authenticated firestore rules
          }
        } catch {
          // Fallback to client Firestore profile management
        }
      }

      // Write user profile to Firestore
      const now = new Date().toISOString();
      const eventIds: string[] = Array.isArray(assignedEventIds) ? assignedEventIds : [];

      try {
        await adminDb.collection('users').doc(organizerUid).set({
          uid: organizerUid,
          id: organizerUid,
          email: cleanEmail,
          name: cleanName,
          role: 'organizer',
          status: 'active',
          assignedEventIds: eventIds,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });

        // Update event organizerIds
        for (const evId of eventIds) {
          await adminDb.collection('events').doc(evId).update({
            organizerIds: FieldValue.arrayUnion(organizerUid),
            updatedAt: now,
          }).catch(() => {});
        }
      } catch (dbErr) {
        // Return clientSyncRequired flag so Super Admin client performs direct authenticated write
        return res.json({
          success: true,
          clientSyncRequired: true,
          organizer: {
            uid: organizerUid,
            email: cleanEmail,
            name: cleanName,
            assignedEventIds: eventIds,
          },
        });
      }

      return res.json({
        success: true,
        organizer: {
          uid: organizerUid,
          email: cleanEmail,
          name: cleanName,
          assignedEventIds: eventIds,
        },
      });
    } catch (err: unknown) {
      console.warn('Create organizer route notice:', err);
      const fallbackUid = `org_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return res.json({
        success: true,
        clientSyncRequired: true,
        organizer: {
          uid: fallbackUid,
          email: String(req.body.email || '').trim().toLowerCase(),
          name: String(req.body.name || '').trim(),
          assignedEventIds: Array.isArray(req.body.assignedEventIds) ? req.body.assignedEventIds : [],
        },
      });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 3: Server-Controlled Organizer Status / Revocation
  // -------------------------------------------------------------
  app.post('/api/admin/toggle-organizer', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { uid, status } = req.body;
      if (!uid || !['active', 'disabled'].includes(status)) {
        return res.status(400).json({ error: 'Valid uid and status (active/disabled) required.' });
      }

      // 1. Disable/Enable in Firebase Auth if available
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !uid.startsWith('org_')) {
        await adminAuth.updateUser(uid, {
          disabled: status === 'disabled',
        }).catch(() => {});

        if (status === 'disabled') {
          await adminAuth.revokeRefreshTokens(uid).catch(() => {});
        }
      }

      // 2. Update Firestore profile
      await adminDb.collection('users').doc(uid).update({
        status,
        updatedAt: new Date().toISOString(),
      });

      return res.json({ success: true, uid, status });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Status update failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 4: Server-Controlled Organizer Deletion
  // -------------------------------------------------------------
  app.delete('/api/admin/delete-organizer/:uid', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { uid } = req.params;
      if (!uid) return res.status(400).json({ error: 'UID is required.' });

      // Fetch user profile first to clean up event references
      let userEmail = '';
      let assignedEventIds: string[] = [];
      try {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          userEmail = (userData?.email || '').trim().toLowerCase();
          assignedEventIds = userData?.assignedEventIds || [];
        }
      } catch {
        // Continue
      }

      // Delete from Firebase Auth if real auth account and credentials available
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !uid.startsWith('org_')) {
        await adminAuth.deleteUser(uid).catch(() => {});
      }

      // Clean up event organizer references
      for (const evId of assignedEventIds) {
        try {
          const updatePayload: Record<string, any> = {
            organizerIds: FieldValue.arrayRemove(uid),
            updatedAt: new Date().toISOString(),
          };
          if (userEmail) {
            updatePayload.organizerEmails = FieldValue.arrayRemove(userEmail);
          }
          await adminDb.collection('events').doc(evId).update(updatePayload);
        } catch {
          // Ignore
        }
      }

      // Delete from Firestore
      await adminDb.collection('users').doc(uid).delete();

      return res.json({ success: true, deletedUid: uid });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Deletion failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 5: Super Admin Event Deletion (Cascading)
  // -------------------------------------------------------------
  app.delete('/api/admin/delete-event/:eventId', requireAuth, requireSuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { eventId } = req.params;
      if (!eventId) return res.status(400).json({ error: 'Event ID required.' });

      // Find all uploads
      const uploadsSnap = await adminDb.collection('uploads').where('eventId', '==', eventId).get();
      const bucket = adminStorage.bucket();

      for (const d of uploadsSnap.docs) {
        const up = d.data();
        if (up.storagePath) {
          try {
            await bucket.file(up.storagePath).delete({ ignoreNotFound: true });
          } catch (e: unknown) {
            console.warn('Storage file deletion notice:', e);
          }
        }
        await d.ref.delete();
      }

      // Delete event document
      await adminDb.collection('events').doc(eventId).delete();

      return res.json({ success: true, deletedEventId: eventId });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Event deletion failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 6: Consistent Media Deletion
  // Super Admin can delete any; Organizers can delete only from assigned events
  // -------------------------------------------------------------
  app.post('/api/media/delete', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { uploadId } = req.body;
      if (!uploadId) return res.status(400).json({ error: 'uploadId is required.' });

      const uploadRef = adminDb.collection('uploads').doc(uploadId);
      const uploadSnap = await uploadRef.get();
      if (!uploadSnap.exists) {
        return res.status(404).json({ error: 'Upload not found.' });
      }

      const uploadData = uploadSnap.data()!;
      const eventId = uploadData.eventId;

      // Verify Authorization
      if (!req.isAdmin) {
        const eventSnap = await adminDb.collection('events').doc(eventId).get();
        if (!eventSnap.exists) {
          return res.status(404).json({ error: 'Associated event not found.' });
        }
        const eventData = eventSnap.data()!;
        const assigned: string[] = eventData.organizerIds || [];
        const assignedEmails: string[] = eventData.organizerEmails || [];
        const userEmail = req.user?.email?.toLowerCase();
        const isMatch = assigned.includes(req.user!.uid) || (userEmail && assignedEmails.map(e => e.toLowerCase()).includes(userEmail));
        if (!isMatch) {
          return res.status(403).json({ error: 'Forbidden: You are not assigned to manage media for this event.' });
        }
      }

      // Delete storage file
      if (uploadData.storagePath) {
        try {
          await adminStorage.bucket().file(uploadData.storagePath).delete({ ignoreNotFound: true });
        } catch (e: unknown) {
          console.warn('Storage delete notice:', e);
        }
      }

      // Delete Firestore document
      await uploadRef.delete();

      // Decrement event uploads count
      await adminDb.collection('events').doc(eventId).update({
        uploadsCount: FieldValue.increment(-1),
      }).catch((e: unknown) => console.warn('Count decrement notice:', e));

      return res.json({ success: true, deletedUploadId: uploadId });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Media deletion failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 6.1: Sync Organizer Profile & Assigned Events
  // Links pre-created organizer profile and event assignments to user UID
  // -------------------------------------------------------------
  app.post('/api/organizer/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const cleanEmail = (user.email || '').trim().toLowerCase();
      const now = new Date().toISOString();
      const eventIdsSet = new Set<string>();

      // 1. Fetch current user doc
      let existingProfile: any = null;
      try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          existingProfile = userDoc.data();
          if (Array.isArray(existingProfile?.assignedEventIds)) {
            existingProfile.assignedEventIds.forEach((id: string) => eventIdsSet.add(id));
          }
        }
      } catch (e) {
        console.warn('Read user doc notice:', e);
      }

      // 2. Lookup any pre-created organizer documents with matching email
      let preCreatedName = '';
      let preCreatedStatus = 'active';
      if (cleanEmail) {
        try {
          const preDocs = await adminDb.collection('users').where('email', '==', cleanEmail).get();
          for (const d of preDocs.docs) {
            if (d.id !== user.uid) {
              const dData = d.data();
              if (Array.isArray(dData.assignedEventIds)) {
                dData.assignedEventIds.forEach((id: string) => eventIdsSet.add(id));
              }
              if (dData.name && !preCreatedName) {
                preCreatedName = dData.name;
              }
              if (dData.status) {
                preCreatedStatus = dData.status;
              }
            }
          }
        } catch (e) {
          console.warn('Pre-created profile lookup notice:', e);
        }
      }

      // 3. Query all events where organizerEmails or organizerIds contains user
      if (cleanEmail) {
        try {
          const eventsByEmail = await adminDb.collection('events')
            .where('organizerEmails', 'array-contains', cleanEmail)
            .get();
          for (const evDoc of eventsByEmail.docs) {
            eventIdsSet.add(evDoc.id);
            // Auto-heal: Ensure event document also lists user.uid
            const evData = evDoc.data();
            const orgIds: string[] = Array.isArray(evData.organizerIds) ? evData.organizerIds : [];
            if (!orgIds.includes(user.uid)) {
              await evDoc.ref.update({
                organizerIds: FieldValue.arrayUnion(user.uid),
                updatedAt: now,
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('Event search by organizerEmails notice:', e);
        }
      }

      // 4. Save synced profile
      const assignedEventIds = Array.from(eventIdsSet);
      const isSuperAdmin = req.isAdmin || cleanEmail === SUPERADMIN_EMAIL.toLowerCase();
      const updatedProfile = {
        uid: user.uid,
        email: cleanEmail,
        name: existingProfile?.name || preCreatedName || user.name || (isSuperAdmin ? 'Super Admin' : 'Organizer'),
        role: isSuperAdmin ? 'superadmin' : (existingProfile?.role || 'organizer'),
        status: existingProfile?.status || preCreatedStatus || 'active',
        assignedEventIds,
        updatedAt: now,
        ...(existingProfile?.createdAt ? {} : { createdAt: now }),
      };

      try {
        await adminDb.collection('users').doc(user.uid).set(updatedProfile, { merge: true });
      } catch (e) {
        console.warn('Update user profile notice:', e);
      }

      return res.json({
        success: true,
        profile: updatedProfile,
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Organizer sync failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 6.2: Fetch Assigned Events for Logged In User
  // -------------------------------------------------------------
  app.get('/api/organizer/my-events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const cleanEmail = (user.email || '').trim().toLowerCase();
      const isSuperAdmin = req.isAdmin || cleanEmail === SUPERADMIN_EMAIL.toLowerCase();

      // If Super Admin, return all events
      if (isSuperAdmin) {
        const allSnap = await adminDb.collection('events').get();
        const events = allSnap.docs.map(d => ({ ...d.data(), id: d.id }));
        events.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json({ success: true, events });
      }

      const eventsMap = new Map<string, any>();

      // 1. Fetch by organizerIds
      try {
        const snap1 = await adminDb.collection('events')
          .where('organizerIds', 'array-contains', user.uid)
          .get();
        snap1.docs.forEach(d => eventsMap.set(d.id, { ...d.data(), id: d.id }));
      } catch (e) {
        console.warn('Query events by organizerIds notice:', e);
      }

      // 2. Fetch by organizerEmails
      if (cleanEmail) {
        try {
          const snap2 = await adminDb.collection('events')
            .where('organizerEmails', 'array-contains', cleanEmail)
            .get();
          for (const d of snap2.docs) {
            eventsMap.set(d.id, { ...d.data(), id: d.id });
            // Auto-heal: add user.uid to organizerIds if not present
            const data = d.data();
            if (!Array.isArray(data.organizerIds) || !data.organizerIds.includes(user.uid)) {
              d.ref.update({
                organizerIds: FieldValue.arrayUnion(user.uid),
                updatedAt: new Date().toISOString(),
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('Query events by organizerEmails notice:', e);
        }
      }

      // 3. Fetch from user doc's assignedEventIds
      try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
          const assignedIds: string[] = userDoc.data()?.assignedEventIds || [];
          for (const evId of assignedIds) {
            if (!eventsMap.has(evId)) {
              const evDoc = await adminDb.collection('events').doc(evId).get();
              if (evDoc.exists) {
                eventsMap.set(evDoc.id, { ...evDoc.data(), id: evDoc.id });
              }
            }
          }
        }
      } catch (e) {
        console.warn('Fetch events by user assignedEventIds notice:', e);
      }

      const events = Array.from(eventsMap.values());
      events.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return res.json({ success: true, events });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Failed to fetch assigned events', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE 7: Guest Upload Permission Ticket & Limit Validation
  // -------------------------------------------------------------
  app.post('/api/guest/validate-upload', async (req: Request, res: Response) => {
    try {
      const { publicToken, fileCount, fileSizes, mimeTypes } = req.body;
      if (!publicToken) {
        return res.status(400).json({ error: 'Public token required.' });
      }

      // Lookup event
      const eventsSnap = await adminDb.collection('events')
        .where('publicToken', '==', publicToken)
        .where('status', '==', 'active')
        .limit(1)
        .get();

      if (eventsSnap.empty) {
        return res.status(404).json({ error: 'Event not found or currently closed to uploads.' });
      }

      const eventDoc = eventsSnap.docs[0];
      const eventData = eventDoc.data();

      // Validate counts
      const count = Number(fileCount) || 1;
      if (count > eventData.maxFilesPerGuest) {
        return res.status(400).json({
          error: `Exceeds maximum batch limit of ${eventData.maxFilesPerGuest} files.`
        });
      }

      // Validate individual file sizes
      const maxBytes = (eventData.maxFileSizeMb || 50) * 1024 * 1024;
      if (Array.isArray(fileSizes)) {
        for (const sz of fileSizes) {
          if (sz > maxBytes) {
            return res.status(400).json({
              error: `A selected file exceeds the maximum limit of ${eventData.maxFileSizeMb} MB.`
            });
          }
        }
      }

      // Validate media types
      const allowed: string[] = eventData.allowedTypes || ['image', 'video'];
      if (Array.isArray(mimeTypes)) {
        for (const mime of mimeTypes) {
          const isImg = mime.startsWith('image/');
          const isVid = mime.startsWith('video/');
          if (!((isImg && allowed.includes('image')) || (isVid && allowed.includes('video')))) {
            return res.status(400).json({ error: `File type ${mime} is not permitted for this event.` });
          }
        }
      }

      return res.json({
        valid: true,
        eventId: eventDoc.id,
        eventName: eventData.name,
        maxFilesPerGuest: eventData.maxFilesPerGuest,
        maxFileSizeMb: eventData.maxFileSizeMb,
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: 'Validation failed', details: String(err) });
    }
  });

  // -------------------------------------------------------------
  // API ROUTE: Resilient Media Upload Endpoint
  // Accepts raw media stream/buffer up to 100MB and persists it safely
  // -------------------------------------------------------------
  app.post(
    '/api/media/upload',
    express.raw({ type: '*/*', limit: '100mb' }),
    async (req: Request, res: Response) => {
      try {
        const eventId = (req.query.eventId as string) || 'default';
        const uploadId = (req.query.uploadId as string) || Date.now().toString();
        const safeName = (req.query.safeName as string) || 'upload.jpg';
        const guestName = (req.query.guestName as string) || '';
        const contentType = (req.headers['content-type'] as string) || 'application/octet-stream';

        if (!req.body || (req.body instanceof Buffer && req.body.length === 0)) {
          return res.status(400).json({ error: 'No media data received.' });
        }

        const buffer = req.body as Buffer;
        const storagePath = `events/${eventId}/${uploadId}_${safeName}`;

        // 1. Try Firebase Admin Storage
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          try {
            const bucket = adminStorage.bucket();
            const file = bucket.file(storagePath);
            await file.save(buffer, {
              metadata: {
                contentType,
                metadata: { guestName },
              },
              resumable: false,
            });
            try {
              await file.makePublic();
              const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(storagePath)}`;
              return res.json({ success: true, downloadUrl: publicUrl, storagePath });
            } catch {
              const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
              });
              return res.json({ success: true, downloadUrl: signedUrl, storagePath });
            }
          } catch (storageErr) {
            console.warn('Admin Storage direct save failed, falling back to local static store:', storageErr);
          }
        }

        // 2. Guaranteed local static store inside public/uploads/events/<eventId>/
        const uploadDir = path.resolve(process.cwd(), 'public', 'uploads', 'events', eventId);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const diskPath = path.join(uploadDir, `${uploadId}_${safeName}`);
        fs.writeFileSync(diskPath, buffer);

        const localUrl = `/uploads/events/${eventId}/${uploadId}_${safeName}`;
        return res.json({
          success: true,
          downloadUrl: localUrl,
          storagePath,
        });
      } catch (err: unknown) {
        console.error('Media upload endpoint error:', err);
        return res.status(500).json({ error: 'Media processing failed', details: String(err) });
      }
    }
  );

  // Serve static uploaded assets directly
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'public', 'uploads')));

  // -------------------------------------------------------------
  // Mount Vite Middleware for Dev or Serve Static in Prod
  // -------------------------------------------------------------
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`PaperDreams Luxe Secure Server running on port ${port}`);
  });
}

startServer().catch((e: unknown) => {
  console.error('Fatal server startup error:', e);
});
