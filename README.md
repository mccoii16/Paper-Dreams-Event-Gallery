# Fotoshare Luxe — Complete Firebase Security Architecture

A production-ready event photo and video sharing platform engineered with strict role-based access control, cryptographic guest links, zero-trust Firestore & Storage rules, and authenticated server-side administrative operations.

**Connected Firebase Project**:
- **Project ID**: `pd-event-gallery`
- **Console URL**: https://console.firebase.google.com/project/pd-event-gallery
- **Storage Bucket**: `pd-event-gallery.firebasestorage.app`
- **Firestore Database ID**: `ai-studio-5e4539de-3546-4405-85fd-6035d5104711`

---

## Deliverables Index

1. **Firestore Security Rules**: Hardened zero-trust ABAC in `/firestore.rules` (deployed via Firebase RPC).
2. **Firebase Storage Security Rules**: Path-isolated rules in `/storage.rules`.
3. **Server-Side Operations**: Authenticated Express/Node endpoints in `/server.ts` utilizing Firebase Admin SDK.
4. **Admin Bootstrap & Custom Claims**: Server-controlled endpoint `/api/admin/bootstrap` setting `{ admin: true, role: 'superadmin' }`.
5. **Firebase App Check**: Client attestation module in `/src/firebase/appCheck.ts` with reCAPTCHA Enterprise.
6. **Automated Security Test Suite**: Comprehensive matrix in `/tests/security.test.ts` verifying all allowed and denied operations.
7. **Firebase Console Configuration Checklist**: Step-by-step instructions below.

---

## 1. User Roles & Security Boundaries

| Role | Auth Required | Permissions & Boundaries |
| :--- | :--- | :--- |
| **Super Admin** (`Martiligando@gmail.com`) | Yes (Google Sign-In) | • Verified via custom claims (`admin: true`) and `/admins/{uid}`.<br>• Only entity permitted to create/delete events.<br>• Only entity permitted to provision, disable, or delete organizer accounts.<br>• Full cascading media deletion across all events. |
| **Organizer** | Yes (Created by Super Admin) | • Can only view and edit events where `request.auth.uid in event.organizerIds`.<br>• Can view, download, and delete media for assigned events only.<br>• Forbidden from deleting events, modifying upload limits, altering public tokens, or self-promoting. |
| **Guest** | No (Anonymous / Token) | • Accesses only `/e/:publicToken` for active events.<br>• Zero read access to uploaded media, internal event IDs, or organizer records.<br>• Can upload valid photos/videos within event limits.<br>• Overwrites, updates, and deletes are strictly denied. |

---

## 2. Server-Side Administrative Operations (`server.ts`)

To ensure client code never holds privileged credentials, administrative operations execute via server endpoints authenticated with Firebase ID tokens:

- **`POST /api/admin/bootstrap`**: Validates the initial super admin identity and mints custom claims `{ admin: true, role: 'superadmin' }`, persisting the immutable identity document in `/admins/{uid}`.
- **`POST /api/admin/create-organizer`**: Provisions an organizer in Firebase Authentication with pre-assigned email and password, setting `{ role: 'organizer', admin: false }` custom claims and creating `/users/{uid}`.
- **`POST /api/admin/toggle-organizer`**: Toggles account status (`active`/`disabled`), dynamically disables the user in Firebase Auth, and revokes all active refresh tokens.
- **`DELETE /api/admin/delete-organizer/:uid`**: Purges organizer record from Firebase Auth and Firestore.
- **`DELETE /api/admin/delete-event/:eventId`**: Cascading deletion of the event document, its metadata in `/uploads`, and binary objects in Firebase Storage.
- **`POST /api/media/delete`**: Verifies whether caller is Super Admin or an assigned organizer before deleting the target file from Storage and decrementing Firestore event counts.
- **`POST /api/guest/validate-upload`**: Pre-flight verification checking event availability, file limits, size boundaries, and MIME types.

---

## 3. Storage Security Rules (`storage.rules`)

Private event media is stored under `/events/{eventId}/{fileName}`:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() && (
        (request.auth.token.keys().hasAny(['admin', 'role']) && (request.auth.token.admin == true || request.auth.token.role == 'superadmin')) ||
        firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid))
      );
    }
    function isAssignedOrganizer(eventId) {
      return isSignedIn() &&
        firestore.exists(/databases/(default)/documents/events/$(eventId)) &&
        (request.auth.uid in firestore.get(/databases/(default)/documents/events/$(eventId)).data.organizerIds);
    }

    match /events/{eventId}/{fileName} {
      allow read: if isAdmin() || isAssignedOrganizer(eventId);
      allow create: if (
        request.resource.size > 0 &&
        request.resource.size <= 524288000 &&
        (request.resource.contentType.matches('image/.*') || request.resource.contentType.matches('video/.*')) &&
        firestore.exists(/databases/(default)/documents/events/$(eventId)) &&
        firestore.get(/databases/(default)/documents/events/$(eventId)).data.status == 'active'
      );
      allow update: if false;
      allow delete: if isAdmin() || isAssignedOrganizer(eventId);
    }
  }
}
```

---

## 4. App Check Attestation (`src/firebase/appCheck.ts`)

Firebase App Check verifies that incoming requests originate from your genuine frontend application:
- Initialized on boot via `initAppCheck()`.
- Utilizes `ReCaptchaEnterpriseProvider` in production.
- Configured with `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` in development for seamless local testing.

---

## 5. Running Verification Tests

Run the full automated security test suite:
```bash
npm test
```
This executes all 13 test cases in `tests/security.test.ts` and `src/utils/security.test.ts`, verifying:
- Prevention of privilege escalation on `/users` and `/admins`.
- Enforcement of event assignment boundaries on organizers.
- Prevention of guest media listing / scraping.
- Rejection of uploads on disabled events.
- Strict MIME and size boundary enforcement.

---

## 6. Firebase Console Configuration Steps

1. **Authentication Providers**:
   - In Firebase Console > **Authentication** > **Sign-in method**:
   - Enable **Google** (for Super Admin sign-in).
   - Enable **Email/Password** (for provisioned organizers).

2. **Deploy Storage Rules**:
   - In Firebase Console > **Storage** > **Rules**:
   - Paste the contents of `/storage.rules` and click **Publish**.

3. **Cloud Firestore Rules**:
   - Deployed automatically via AI Studio RPC (`fax.DeployRules`). You can verify them under Firebase Console > **Firestore Database** > **Rules**.

4. **App Check (Optional but Recommended for Production)**:
   - In Firebase Console > **App Check**:
   - Register your web app with **reCAPTCHA Enterprise** and insert the public site key into `firebase-applet-config.json` under `recaptchaSiteKey`.
   - Set enforcement to **Enforce** on Cloud Firestore and Cloud Storage.
