# @services/user-consents

Manages user consent records (e.g., privacy policy, terms of service) — creating, retrieving, and revoking consents.

## Key exports

- `grantConsent(userId, consentType, version)` — revokes any existing active row for `(user, type)` and inserts a new one for the given version
- `ensureConsentVersion(userId, consentType, version)` — no-op when the active version already matches (non-locking pre-read); otherwise atomically revokes the stale row and inserts the new version using `SELECT ... FOR UPDATE` inside a transaction; used on sign-in to keep consents current
- `getActiveConsents(userId)` — returns all non-revoked consent rows for a user
- `hasActiveConsent(userId, consentType)` — returns `true` when an active consent of that type exists
- `revokeConsent(userId, consentType)` — revokes (soft-deletes) an existing consent

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Privacy requirements: [../../../docs/requirements/users/PRIVACY.md](../../../docs/requirements/users/PRIVACY.md)
- Users service: [../users/README.md](../users/README.md)
