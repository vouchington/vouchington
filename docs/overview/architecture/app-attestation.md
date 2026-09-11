# App Attest

Apple **App Attest** (`DCAppAttestService`) lets a genuine native Apple app build prove device
authenticity to the backend without a user-facing challenge. Voucha uses it for three purposes:

- **Bypass Cloudflare Turnstile** on the eight actions gated by CAPTCHA (see
  [captcha.md § Action × provider matrix](captcha.md#action--provider-matrix)) — a hardware-backed
  assertion replaces the Turnstile WebView that native clients would otherwise have to present.
- **Sign every request** from an attested device so that a stolen bearer `dt` cookie alone cannot
  act as that device — each request carries an Enclave-signed proof-of-possession header set (see
  [Per-Request Signing](#per-request-signing) below).
- **Extend the session cookie** from the default 2-day expiry to 30 days once a device completes
  attestation (see [Session Duration](#session-duration-the-dc-claim) below).

Native Turnstile friction and the short default session are the motivating problems: without App
Attest, a native client has to embed a Turnstile WebView for every gated action and re-authenticate
sessions twice as often as an attested device needs to. Non-attestable devices (Simulator,
unsupported OS versions, Intel Macs without the required Secure Enclave support) keep using the
existing Turnstile WebView (`NativeTurnstileChallengeView.swift`) — App Attest is additive, not a
hard requirement. See [native-clients.md](native-clients.md) for the client-side call sites.

## Contents

- <a id="two-ceremonies"></a>[Two Ceremonies](reference-app-attestation-two-ceremonies.md)
- <a id="turnstile-bypass-decision-path"></a>[Turnstile Bypass Decision Path](reference-app-attestation-two-ceremonies.md#turnstile-bypass-decision-path)
- <a id="per-request-signing"></a>[Per-Request Signing](reference-app-attestation-two-ceremonies.md#per-request-signing)
- <a id="session-duration-the-dc-claim"></a>[Session Duration (the `dc` claim)](reference-app-attestation-session-duration-the-dc-claim.md)
- <a id="native-device-identity"></a>[Native Device Identity](reference-app-attestation-session-duration-the-dc-claim.md#native-device-identity)
- <a id="replay-defenses"></a>[Replay Defenses](reference-app-attestation-session-duration-the-dc-claim.md#replay-defenses)
- <a id="configuration"></a>[Configuration](reference-app-attestation-configuration.md)
- <a id="supported-devices"></a>[Supported Devices](reference-app-attestation-supported-devices.md)
- <a id="not-yet-implemented"></a>[Not Yet Implemented](reference-app-attestation-supported-devices.md#not-yet-implemented)
- <a id="related"></a>[Related](reference-app-attestation-supported-devices.md#related)
