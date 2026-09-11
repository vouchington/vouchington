# Notes

[Back to JWT Session Service](README.md#notes)

- Audience (`aud`) scoping prevents cross-token use (device token ≠ session token).
- Session/device/user creation and refresh events emit to the `auth_sessions` analytics table (`@services/analytics`); daily uniqueness counts (DAU/MAU/devices) are derived in S3 Tables (Phase 3).
- Per-request auth checks revocation for uid-bearing sessions before treating the session as logged in.
