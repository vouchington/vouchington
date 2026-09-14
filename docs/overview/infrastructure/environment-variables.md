# Environment Variables

Complete inventory of environment variables used across the application. Grouped by category. For
local developer setup, use the credentials/config matrix in
[local-env-vars.md](../../development/local-env-vars.md).

Before env-var or Dynamic Config migrations, run `./dev/config-inventory` from the repository root
for a generated Filaments checklist covering readers, docs, workflows, package gates, and
DynamicConfig registry state. Shared deployment and local setup metadata comes from the typed
[env-var contract](./env-var-contract.md); deployment changes require a separate handoff to
`vouchington-infra`.

The contract-backed rows in this page and
[local-env-vars.md](../../development/local-env-vars.md) are drift-checked against
`@ts-shared/env-contract`. Sections that stay intentionally hand-maintained call that out in the
section notes.

**Where set** legend:

- **SM** = secret-managed value; for ECS task definition `secrets` entries, this means AWS Systems
  Manager Parameter Store SecureString (SSM) unless the row says **Secrets Manager**
- **Secrets Manager** = AWS Secrets Manager (Aurora-managed password secret)
- **ECS** = ECS task definition environment (non-secret)
- **Lambda** = AWS Lambda environment variable
- **CF** = Cloudflare Worker variable (identifier-free local config or private infrastructure)
- **Build** = Docker build argument (baked into image at build time)
- **Runtime public** = non-secret browser config read by ECS/Next.js at request time and serialized
  into the HTML bootstrap for client components

## Contents

- <a id="typed-contract-coverage"></a>[Typed Contract Coverage](reference-environment-variables-typed-contract-coverage.md)
- <a id="adding-third-party-integrations"></a>[Adding Third-Party Integrations](reference-environment-variables-typed-contract-coverage.md)
- <a id="core-infrastructure"></a>[Core Infrastructure](reference-environment-variables-typed-contract-coverage.md)
- <a id="feature-flags"></a>[Feature Flags](reference-environment-variables-feature-flags.md)
- <a id="authentication"></a>[Authentication](reference-environment-variables-authentication.md)
- <a id="oauth-providers"></a>[OAuth Providers](reference-environment-variables-oauth-providers.md)
- <a id="bluesky-at-protocol"></a>[Bluesky (AT Protocol)](reference-environment-variables-bluesky-at-protocol.md)
- <a id="payments-stripe"></a>[Payments (Stripe)](reference-environment-variables-payments-stripe.md)
- <a id="payments-apple-app-store"></a>[Payments (Apple App Store)](reference-environment-variables-payments-apple-app-store.md)
- <a id="payments-google-play"></a>[Payments (Google Play)](reference-environment-variables-payments-google-play.md)
- <a id="payments-microsoft-store"></a>[Payments (Microsoft Store)](reference-environment-variables-payments-microsoft-store.md)
- <a id="email-ses"></a>[Email (SES)](reference-environment-variables-email-ses.md)
- <a id="ai--ml"></a>[AI / ML](reference-environment-variables-ai-ml.md)
- <a id="analytics-pipeline"></a>[Analytics Pipeline](reference-environment-variables-analytics-pipeline.md)
- <a id="bot-protection-turnstile"></a>[Bot Protection (Turnstile)](reference-environment-variables-bot-protection-turnstile.md)
- <a id="native-app-attestation"></a>[Native App Attestation](reference-environment-variables-native-app-attestation.md)
- <a id="bot-protection-recaptcha-enterprise"></a>[Bot Protection (reCAPTCHA Enterprise)](reference-environment-variables-bot-protection-recaptcha-enterprise.md)
- <a id="push-notifications"></a>[Push Notifications](reference-environment-variables-push-notifications.md)
- <a id="monitoring"></a>[Monitoring](reference-environment-variables-monitoring.md)
- <a id="web-build-time-and-runtime-public-config"></a>[Web Build-Time And Runtime-Public Config](reference-environment-variables-web-build-time-and-runtime-public-config.md)
- <a id="cloudflare-worker"></a>[Cloudflare Worker](reference-environment-variables-cloudflare-worker.md)
- <a id="sideload-image-security"></a>[Sideload Image Security](reference-environment-variables-sideload-image-security.md)
- <a id="aws-s3-storage"></a>[AWS S3 Storage](reference-environment-variables-aws-s3-storage.md)
- <a id="browser-crawl-lightpanda"></a>[Browser Crawl (Lightpanda)](reference-environment-variables-browser-crawl-lightpanda.md)
- <a id="server-configuration"></a>[Server Configuration](reference-environment-variables-server-configuration.md)
- <a id="related"></a>[Related](reference-environment-variables-server-configuration.md)
