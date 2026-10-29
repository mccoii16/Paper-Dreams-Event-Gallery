# Security Specification: Fotoshare Luxe

## 1. Data Invariants

1. **Admins & Identity Integrity**:
   - Only the bootstrapped super admin (`Martiligando@gmail.com` with verified email) or records present in `/databases/$(database)/documents/admins/{uid}` can perform super-admin operations (creating organizer accounts, deleting events, setting global policies).
   - Non-admin users cannot elevate their own role to `superadmin` or write to the `/admins/` collection.

2. **Event Confidentiality & Integrity**:
   - Guests can only view active events (`status == 'active'`) and only via the matching `publicToken`. Disabled or deleted events reject reads and uploads.
   - Organizers can only read events where `request.auth.uid in resource.data.organizerIds`.
   - Organizers can update metadata (`name`, `description`, `date`, `location`, `bannerUrl`, `updatedAt`) on their assigned events, but CANNOT modify `publicToken`, `createdBy`, `status`, `organizerIds`, `maxFilesPerGuest`, or `maxFileSizeMb`, and CANNOT delete events.
   - Deleting events is strictly restricted to Super Admin.

3. **Upload Privacy & Anti-Scraping**:
   - Media uploads (`/uploads/{uploadId}`) are completely hidden from public/guest view. Guests have zero read/list access.
   - Guests can only CREATE upload records for active events where `incoming().publicToken` matches the target event's `publicToken`.
   - Upload records cannot be modified once created.
   - Only assigned organizers and Super Admins can list, view, and delete uploaded media records.

4. **Resource Exhaustion & Denial of Wallet Protections**:
   - All string fields have strict `.size()` upper bounds.
   - Document IDs and public tokens are constrained with regex `^[a-zA-Z0-9_\-]+$`.
   - Incoming file size, MIME type, and media type must conform to strict allowlists (`image`, `video`).

---

## 2. The "Dirty Dozen" Payloads (Adversarial Tests)

1. **Spoofed Super Admin Profile Injection**:
   - *Attack*: An unauthenticated guest or standard organizer attempts to write to `/admins/{uid}` with `email: "attacker@gmail.com"`.
   - *Target*: `/admins/attackerUid`
   - *Expectation*: `PERMISSION_DENIED`.

2. **Self-Role Privilege Escalation**:
   - *Attack*: An organizer updates their own `/users/{uid}` document to change `role: "organizer"` to `role: "superadmin"`.
   - *Target*: `/users/organizerUid`
   - *Expectation*: `PERMISSION_DENIED`.

3. **Organizer Event Deletion**:
   - *Attack*: An organizer sends a `delete` request for an event `/events/{eventId}` assigned to them.
   - *Target*: `/events/eventId`
   - *Expectation*: `PERMISSION_DENIED`.

4. **Guest Query Scrape of Private Uploads**:
   - *Attack*: A guest attempts to list or get `/uploads` to see photos uploaded by others.
   - *Target*: `/uploads`
   - *Expectation*: `PERMISSION_DENIED`.

5. **Upload Injection to Disabled Event**:
   - *Attack*: A guest attempts to create an upload record for an event whose status is `disabled`.
   - *Target*: `/uploads/newUpload` with `eventId` of disabled event.
   - *Expectation*: `PERMISSION_DENIED`.

6. **Public Token Mismatch Attack**:
   - *Attack*: A guest attempts to upload with an invalid or mismatched `publicToken` to tamper with an event's upload collection.
   - *Target*: `/uploads/newUpload` with invalid `publicToken`.
   - *Expectation*: `PERMISSION_DENIED`.

7. **Cross-Organizer Event Peeking**:
   - *Attack*: Organizer B attempts to read `/events/eventA` assigned only to Organizer A.
   - *Target*: `/events/eventA`
   - *Expectation*: `PERMISSION_DENIED`.

8. **Organizer Setting Hijack (Changing Limits & Token)**:
   - *Attack*: Organizer attempts to update `publicToken` or `maxFilesPerGuest` on an event.
   - *Target*: `/events/eventA`
   - *Expectation*: `PERMISSION_DENIED`.

9. **Ghost Field Shadow Injection on Upload**:
   - *Attack*: Guest creates an upload record with an extra rogue field `isAdminApproved: true` or `verified: true`.
   - *Target*: `/uploads/newUpload`
   - *Expectation*: `PERMISSION_DENIED`.

10. **Unauthenticated Event Modification**:
    - *Attack*: Guest attempts to edit event name or date.
    - *Target*: `/events/eventId`
    - *Expectation*: `PERMISSION_DENIED`.

11. **Malicious MIME / Type Poisoning**:
    - *Attack*: Guest attempts to upload with `mediaType: "executable"` or `mimeType: "application/x-msdownload"`.
    - *Target*: `/uploads/newUpload`
    - *Expectation*: `PERMISSION_DENIED`.

12. **Tampering with Existing Uploads**:
    - *Attack*: Guest attempts to overwrite or update an existing upload record.
    - *Target*: `/uploads/uploadId`
    - *Expectation*: `PERMISSION_DENIED`.
