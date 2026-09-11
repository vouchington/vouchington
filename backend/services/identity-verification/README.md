# @services/identity-verification

Manages the paid identity-verification lifecycle via Stripe Identity VerificationSessions. Users pay a one-time fee to submit a government-issued ID; a cryptographic fingerprint of the document is stored (never the raw number) to detect duplicate accounts.

## Key exports

- `startIdentityVerification(currentUser, {successUrl, cancelUrl})` — checks eligibility, creates a Stripe Checkout session, and sets `verification_status = 'payment_pending'`. Free accounts receive one $5 provider attempt; subsequent provider attempts require a support grant. Active/past-due Plus and Pro receive one lifetime included attempt.
- `grantIdentityVerificationAttempt(userId, grantedById, grantNote)` — records an auditable support-granted retry; grants are consumed only when their Checkout creates a provider session.
- `onCheckoutCompletedForIdentity(eventId, eventData)` — Stripe webhook: transitions from `payment_pending` → `identity_pending` and creates a Stripe Identity VerificationSession; accepts `payment_status === 'paid'` or `'no_payment_required'` (zero-fee checkout)
- `onVerificationSessionVerified(eventId, eventData)` — Stripe webhook: stores the HMAC fingerprint in `verified_identities`, sets `verification_status = 'verified'`
- `onVerificationSessionRequiresInput(eventId, eventData)` — Stripe webhook: invalidates user cache; keeps `verification_status = 'identity_pending'` because `requires_input` is recoverable (user can retry document upload on the same session without a new payment)
- `onVerificationSessionCanceled(eventId, eventData)` — Stripe webhook: resets `verification_status = 'unverified'`
- `updateDisplayPreferences(userId, input)` — updates `verified_badge_visible` and/or `public_verified_name_display`
- `assertEligibleForIdentityVerification(currentUser)` — throws 422 if the user is ineligible (suspended, email unverified, already verified, etc.)
- `computeIdentityFingerprint({issuingCountry, documentType, documentNumber})` — returns a 64-char HMAC-SHA256 hex fingerprint; caller must discard the raw document number after calling this

## Security

- Raw document numbers are **never** stored or logged; only the 64-char HMAC fingerprint is persisted.
- `verified_first_name`, `verified_last_name_initial`, `verified_full_name` are `PrivateUser`-only fields; `PublicUser` only receives the computed `verified_display_name`.
- Attempt reservations are durable. Abandoned Checkout sessions are released; provider-session creation is irreversible and consumes the attempt, including when the provider later returns a terminal failure or cancellation.
- Hard-deleted users are reassigned to the tombstone account in the attempt ledger; this preserves
  pseudonymized billing/support audit linkage while retaining no deleted account identifier.

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Stripe service: [../stripe/README.md](../stripe/README.md)
- Users service: [../users/README.md](../users/README.md)
- Migration: [../../data-stores/psql/migrations/0310-00-00-identity-verification.sql](../../data-stores/psql/migrations/0310-00-00-identity-verification.sql)
- API routes: [../../api/v1/my/identity-verification.mts](../../api/v1/my/identity-verification.mts)
- Stripe webhook wiring: [../stripe-webhook-processing/](../stripe-webhook-processing/)
- Trust-tier integration: [../user-rate-limits/trust-tier.mts](../user-rate-limits/trust-tier.mts)
- Vote-weight integration: [../vote-weight/calculate.mts](../vote-weight/calculate.mts)
