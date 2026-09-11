# Valkey Keys

[Back to JWT Session Service](README.md#valkey-keys)

| Key                                       | Purpose                               | TTL                                                                                                                                      |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `voucha:jwt-revoked:{sid}`                | Revoked session flag                  | Longest supported session lifetime — see `REVOCATION_EXPIRATION_SECONDS` in [`session-revocation-keys.mts`](session-revocation-keys.mts) |
| `voucha:jwt-user-revoked-before:{userId}` | User-wide revocation cutoff timestamp | `REVOCATION_EXPIRATION_SECONDS` in [`session-revocation-keys.mts`](session-revocation-keys.mts)                                          |
| `voucha:jwt-stale:{userId}`               | Stale claims flag                     | `SESSION_EXPIRATION_SECONDS` (2 days)                                                                                                    |
