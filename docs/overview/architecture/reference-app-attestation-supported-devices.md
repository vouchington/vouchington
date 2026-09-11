# App Attest reference

[Back to App Attest](app-attestation.md)

## Supported Devices

App Attest requires a Secure Enclave and an attestation-capable OS: recent iPhones/iPads and Apple
Silicon Macs on current OS versions. `AppAttestationService.isSupported` (the [Swift client](https://github.com/vouchington/vouchington-clients/tree/main/swift-clients/core/Sources/VouchaAuth)) reports availability at
runtime; when it is `false` (Simulator, Intel Macs without the required Secure Enclave support,
unsupported OS versions), native clients fall back to the pre-existing Turnstile WebView
(`NativeTurnstileChallengeView.swift` in the [Swift client](https://github.com/vouchington/vouchington-clients/tree/main/swift-clients/ui/Sources/VouchaFeatures/NativeParity)) — the same UI already used before App
Attest existed.

## Not Yet Implemented

These are tracked as follow-up work, not part of this feature:

- Android Play Integrity (Android currently has no native client build; tracked with the
  Swift-Android effort in [native-clients.md](native-clients.md))
- Windows/.NET device attestation
- Third-party anti-bot SDKs
- Certificate pinning for API requests
- Extending per-request signing to Android (Play Integrity) and .NET (TPM) once those platforms gain device attestation support
- Replacing `dt`/device identity with the attestation key as the durable device identifier — today
  Swift uses the key ID as a local/native identifier (see [Native Device Identity](reference-app-attestation-session-duration-the-dc-claim.md#native-device-identity)),
  but backend `did`/`dt` remain the re-mintable session-token source of truth. A device that loses
  its device token still needs to re-attest to bind its key to a new `did`.

## Related

- [App Attestation service](../../../backend/services/app-attestation/README.md) — verification
  internals, DB schema, boundary rules
- [App Attestation API routes](../../../backend/api/v1/app-attestation/README.md) — request/response
  shapes, rate limits
- [Captcha & Bot Protection](captcha.md) — Turnstile/reCAPTCHA and the bypass integration point
- [Auth Overview](auth-overview.md) — device/session token model
- [JWT Session service](../../../backend/services/jwt-session/README.md) — `dc` claim and session
  expiry mechanics
- [Dynamic Config](dynamic-config.md) — DynamicConfig namespace pattern
