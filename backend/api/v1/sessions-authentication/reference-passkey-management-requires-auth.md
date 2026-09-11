# Passkey Management (requires auth)

[Back to Sessions & Authentication API](README.md#passkey-management-requires-auth)

### GET /api/v1/auth/passkeys

Returns current user's passkeys (id, name, device_type, backed_up, created_at, last_used_at).

### PATCH /api/v1/auth/passkeys/:id

**Body:** `{ name: string }` (1–100 characters). Renames a passkey belonging to the current user. Returns 204 on success, 404 if not found or belongs to another user.

### DELETE /api/v1/auth/passkeys/:id

Removes a passkey belonging to the current user. Enforces minimum one auth method (errors if this is the last auth method). Returns 204 on success, 404 if not found or belongs to another user.
