# DELETE /api/v1/session

[Back to Sessions & Authentication API](README.md#delete-apiv1session)

Logs out the user by invalidating the current uid-bearing session, then creates a new anonymous
session (preserving the device token if valid). Anonymous sessions are rotated without writing a
revocation marker.

**Response:** Same shape as PATCH, but with `uid: null` — a new anonymous session.
