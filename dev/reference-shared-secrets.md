# Shared Secrets

[Back to Dev Environment Reference](README.md#shared-secrets)

No shared secrets are required to start the local app. `~/voucha.env` is optional and should only
contain credentials for cloud-backed features you are actively testing, such as S3 uploads or real
OpenAI calls. `./dev/initialize web` generates local Web Push keys, the worker secret, and local
development token secrets automatically.

Use [../docs/development/local-env-vars.md](../docs/development/local-env-vars.md) as the source of
truth for local credentials and config. Turnstile uses Cloudflare's public always-pass test keys in
normal local dev; set real Turnstile keys only for deployed staging/production or explicit local
opt-in testing.
