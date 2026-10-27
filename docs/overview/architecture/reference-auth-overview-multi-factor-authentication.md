# Authentication Overview reference

[Back to Authentication Overview](auth-overview.md)

## Multi-Factor Authentication

Passkeys and verified TOTP authenticators provide account MFA. Primary email or provider sign-in
for an enrolled account creates a pending login attempt. Completing that attempt consumes it
atomically and establishes a session with signed MFA assurance. Discoverable passkey sign-in
establishes that assurance after user verification. Refresh, credential replay and verified native
binding changes preserve the original verification instant; enrollment or device attestation does
not establish new MFA assurance.

Administrator authorization requires this session assurance. Role grants require an enrolled
factor, and administrators cannot remove their final verified factor. An administrator who has
not completed MFA can use ordinary account settings to enroll and then sign in again. Staff OAuth
consent records the issuing session's assurance on its grant. Staff bearer use requires that proof
and a currently enrolled factor; other credential audiences do not carry administrator authority.

## Fresh authentication for account changes

Email changes, factor enrollment and removal, and provider linking require a fresh proof of
identity. Email re-authentication always addresses the primary registered address before a change.
The mutation consumes its proof atomically, so concurrent requests cannot reuse it. Clients prompt
before changing settings and present the proof with the mutation. Provider broker authorization
consumes the proof when creating its session-bound connection intent and bounds that intent's
lifetime to the freshness window.

A successful change revokes other sessions and queues a notification addressed to the primary
captured before mutation. Keeping the captured delivery address in the sensitive queue payload
prevents delivery from following the replacement primary. Delivery failure does not restore access
for revoked sessions.

Revocation commits with the settings change while preserving the current session and its original
credential epoch. Authentication and renewal consult the primary session authority, so loss of a
Valkey entry cannot restore access to another revoked session. Notification admission failures are
reported after commit and do not make a completed settings change appear to have rolled back.
