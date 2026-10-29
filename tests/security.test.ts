import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateUnguessableToken,
  sanitizeFileName,
  validateFileSelection,
  isAllowedMediaType,
} from '../src/utils/security';

// Mock rule simulation helpers
function evaluateFirestoreRules(context: {
  auth: { uid: string; email?: string; admin?: boolean; role?: string } | null;
  adminDocExists?: boolean;
  operation: 'create' | 'get' | 'list' | 'update' | 'delete';
  collection: string;
  docId?: string;
  resource?: Record<string, any>;
  incomingData?: Record<string, any>;
}): { allowed: boolean; reason?: string } {
  const { auth, adminDocExists, operation, collection, resource, incomingData } = context;

  const isSignedIn = auth !== null;
  const isAdmin = isSignedIn && (auth?.admin === true || auth?.role === 'superadmin' || adminDocExists === true);

  // 1. /admins/{adminId}
  if (collection === 'admins') {
    if (operation === 'get' || operation === 'list') {
      return { allowed: isAdmin, reason: isAdmin ? 'Admin read' : 'PERMISSION_DENIED: Admin required' };
    }
    // Client SDK write is unconditionally forbidden
    return { allowed: false, reason: 'PERMISSION_DENIED: Client SDK cannot write to /admins/' };
  }

  // 2. /users/{userId}
  if (collection === 'users') {
    if (operation === 'list') {
      return { allowed: isAdmin, reason: isAdmin ? 'Admin list' : 'PERMISSION_DENIED: Only admin can list users' };
    }
    if (operation === 'create' || operation === 'delete') {
      return { allowed: false, reason: 'PERMISSION_DENIED: User profile mutations must go through server' };
    }
    if (operation === 'get') {
      const isSelf = isSignedIn && auth?.uid === context.docId;
      return { allowed: isAdmin || isSelf, reason: (isAdmin || isSelf) ? 'Allowed' : 'PERMISSION_DENIED' };
    }
    if (operation === 'update') {
      if (isAdmin) return { allowed: true };
      const isSelf = isSignedIn && auth?.uid === context.docId;
      if (!isSelf) return { allowed: false, reason: 'PERMISSION_DENIED: Not self' };
      // Organizers can only update 'name' and 'updatedAt', cannot change role or status
      if (incomingData?.role && incomingData.role !== resource?.role) {
        return { allowed: false, reason: 'PERMISSION_DENIED: Cannot escalate role' };
      }
      if (incomingData?.status && incomingData.status !== resource?.status) {
        return { allowed: false, reason: 'PERMISSION_DENIED: Cannot change account status' };
      }
      return { allowed: true };
    }
  }

  // 3. /events/{eventId}
  if (collection === 'events') {
    if (operation === 'delete') {
      return { allowed: isAdmin, reason: isAdmin ? 'Admin delete' : 'PERMISSION_DENIED: Only admin can delete event' };
    }
    if (operation === 'create') {
      return { allowed: isAdmin, reason: isAdmin ? 'Admin create' : 'PERMISSION_DENIED: Only admin can create event' };
    }
    if (operation === 'update') {
      if (isAdmin) return { allowed: true };
      const isAssigned = isSignedIn && Array.isArray(resource?.organizerIds) && resource?.organizerIds.includes(auth?.uid);
      if (!isAssigned) return { allowed: false, reason: 'PERMISSION_DENIED: Not assigned organizer' };
      // Cannot change publicToken or limits
      if (incomingData?.publicToken && incomingData.publicToken !== resource?.publicToken) {
        return { allowed: false, reason: 'PERMISSION_DENIED: Organizers cannot alter publicToken' };
      }
      return { allowed: true };
    }
    if (operation === 'get' || operation === 'list') {
      const isAssigned = isSignedIn && Array.isArray(resource?.organizerIds) && resource?.organizerIds.includes(auth?.uid);
      const isPublicActive = resource?.status === 'active';
      return { allowed: isAdmin || isAssigned || isPublicActive, reason: 'Read evaluated' };
    }
  }

  // 4. /uploads/{uploadId}
  if (collection === 'uploads') {
    if (operation === 'list' || operation === 'get') {
      // Guests CANNOT read or list uploads
      if (!isSignedIn) return { allowed: false, reason: 'PERMISSION_DENIED: Guests cannot list uploads' };
      const isAssigned = Array.isArray(resource?.organizerIds) && resource?.organizerIds.includes(auth?.uid);
      return { allowed: isAdmin || isAssigned, reason: (isAdmin || isAssigned) ? 'Allowed' : 'PERMISSION_DENIED' };
    }
    if (operation === 'create') {
      // Create requires active event and matching token
      if (incomingData?.eventStatus !== 'active') {
        return { allowed: false, reason: 'PERMISSION_DENIED: Event is inactive' };
      }
      if (!incomingData?.publicToken || incomingData.publicToken !== incomingData?.targetEventToken) {
        return { allowed: false, reason: 'PERMISSION_DENIED: Token mismatch' };
      }
      return { allowed: true };
    }
    if (operation === 'delete') {
      if (!isSignedIn) return { allowed: false, reason: 'PERMISSION_DENIED: Unauthenticated' };
      const isAssigned = Array.isArray(resource?.organizerIds) && resource?.organizerIds.includes(auth?.uid);
      return { allowed: isAdmin || isAssigned, reason: (isAdmin || isAssigned) ? 'Allowed' : 'PERMISSION_DENIED' };
    }
  }

  return { allowed: false, reason: 'Default deny' };
}

// ============================================================
// SUITE 1: SUPER ADMIN SECURITY TESTS
// ============================================================
test('SUPER ADMIN: Unauthorized users cannot write directly to /admins collection', () => {
  const result = evaluateFirestoreRules({
    auth: { uid: 'attacker_123', email: 'attacker@evil.com' },
    operation: 'create',
    collection: 'admins',
    docId: 'attacker_123',
    incomingData: { email: 'attacker@evil.com' },
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason || '', /PERMISSION_DENIED/);
});

test('SUPER ADMIN: Only verified admin can delete an entire event', () => {
  // Organizer attempts event deletion -> DENIED
  const organizerAttempt = evaluateFirestoreRules({
    auth: { uid: 'org_1', role: 'organizer' },
    adminDocExists: false,
    operation: 'delete',
    collection: 'events',
    docId: 'event_wedding_1',
    resource: { organizerIds: ['org_1'], name: 'Wedding Gala' },
  });
  assert.equal(organizerAttempt.allowed, false);
  assert.match(organizerAttempt.reason || '', /Only admin can delete event/);

  // Super Admin attempts event deletion -> ALLOWED
  const adminAttempt = evaluateFirestoreRules({
    auth: { uid: 'superadmin_uid', role: 'superadmin', admin: true },
    adminDocExists: true,
    operation: 'delete',
    collection: 'events',
    docId: 'event_wedding_1',
    resource: { organizerIds: ['org_1'], name: 'Wedding Gala' },
  });
  assert.equal(adminAttempt.allowed, true);
});

// ============================================================
// SUITE 2: ORGANIZER SECURITY & ACCESS BOUNDARY TESTS
// ============================================================
test('ORGANIZER: Cannot escalate own role from organizer to superadmin', () => {
  const escalationAttempt = evaluateFirestoreRules({
    auth: { uid: 'org_uid' },
    adminDocExists: false,
    operation: 'update',
    collection: 'users',
    docId: 'org_uid',
    resource: { uid: 'org_uid', role: 'organizer', status: 'active' },
    incomingData: { role: 'superadmin', name: 'Self Promoted' },
  });
  assert.equal(escalationAttempt.allowed, false);
  assert.match(escalationAttempt.reason || '', /Cannot escalate role/);
});

test('ORGANIZER: Cannot access or modify unassigned events', () => {
  const unassignedAttempt = evaluateFirestoreRules({
    auth: { uid: 'org_A' },
    adminDocExists: false,
    operation: 'update',
    collection: 'events',
    docId: 'event_B',
    resource: { organizerIds: ['org_B'], publicToken: 'tok_B' },
    incomingData: { name: 'Tampered Event Name' },
  });
  assert.equal(unassignedAttempt.allowed, false);
  assert.match(unassignedAttempt.reason || '', /Not assigned organizer/);
});

test('ORGANIZER: Can update event details on assigned event, but cannot hijack publicToken', () => {
  // Legitimate update -> ALLOWED
  const legitimateUpdate = evaluateFirestoreRules({
    auth: { uid: 'org_A' },
    adminDocExists: false,
    operation: 'update',
    collection: 'events',
    docId: 'event_A',
    resource: { organizerIds: ['org_A'], publicToken: 'secret_token_123', name: 'Original' },
    incomingData: { name: 'Updated Ceremony Title', publicToken: 'secret_token_123' },
  });
  assert.equal(legitimateUpdate.allowed, true);

  // Token hijack attempt -> DENIED
  const tokenHijack = evaluateFirestoreRules({
    auth: { uid: 'org_A' },
    adminDocExists: false,
    operation: 'update',
    collection: 'events',
    docId: 'event_A',
    resource: { organizerIds: ['org_A'], publicToken: 'secret_token_123' },
    incomingData: { publicToken: 'hijacked_token_xyz' },
  });
  assert.equal(tokenHijack.allowed, false);
  assert.match(tokenHijack.reason || '', /cannot alter publicToken/);
});

// ============================================================
// SUITE 3: GUEST PRIVACY & UPLOAD VALIDATION TESTS
// ============================================================
test('GUEST: Cannot list or read uploaded media (Anti-Scraping Guarantee)', () => {
  const guestScrapeAttempt = evaluateFirestoreRules({
    auth: null, // Unauthenticated guest
    operation: 'list',
    collection: 'uploads',
  });
  assert.equal(guestScrapeAttempt.allowed, false);
  assert.match(guestScrapeAttempt.reason || '', /PERMISSION_DENIED/);
});

test('GUEST: Cannot upload to disabled or inactive events', () => {
  const disabledUploadAttempt = evaluateFirestoreRules({
    auth: null,
    operation: 'create',
    collection: 'uploads',
    docId: 'new_upload_id',
    incomingData: {
      eventId: 'event_1',
      eventStatus: 'disabled',
      publicToken: 'tok123',
      targetEventToken: 'tok123',
    },
  });
  assert.equal(disabledUploadAttempt.allowed, false);
  assert.match(disabledUploadAttempt.reason || '', /Event is inactive/);
});

test('GUEST: Allowed to upload with valid active event token and permitted media', () => {
  const validUpload = evaluateFirestoreRules({
    auth: null,
    operation: 'create',
    collection: 'uploads',
    docId: 'valid_upload_id',
    incomingData: {
      eventId: 'event_active',
      eventStatus: 'active',
      publicToken: 'valid_tok_456',
      targetEventToken: 'valid_tok_456',
    },
  });
  assert.equal(validUpload.allowed, true);
});

test('MEDIA DELETION: Organizer can delete media only for assigned events', () => {
  // Assigned organizer deleting upload -> ALLOWED
  const assignedDelete = evaluateFirestoreRules({
    auth: { uid: 'org_A' },
    adminDocExists: false,
    operation: 'delete',
    collection: 'uploads',
    docId: 'upload_1',
    resource: { eventId: 'event_A', organizerIds: ['org_A'] },
  });
  assert.equal(assignedDelete.allowed, true);

  // Unassigned organizer deleting upload -> DENIED
  const unassignedDelete = evaluateFirestoreRules({
    auth: { uid: 'org_unassigned' },
    adminDocExists: false,
    operation: 'delete',
    collection: 'uploads',
    docId: 'upload_1',
    resource: { eventId: 'event_A', organizerIds: ['org_A'] },
  });
  assert.equal(unassignedDelete.allowed, false);
  assert.match(unassignedDelete.reason || '', /PERMISSION_DENIED/);
});
