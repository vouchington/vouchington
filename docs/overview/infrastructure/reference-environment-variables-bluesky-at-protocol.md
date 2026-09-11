# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Bluesky (AT Protocol)

Bluesky account-linking (`backend/modules/bluesky-oauth`) is a confidential `private_key_jwt` OAuth
client, not a `client_id`/`client_secret` pair: it signs token requests with a private ES256 (EC
P-256) key and serves the corresponding public JWKS inline from `GET /client-metadata.json`. There
is no separate public-key env var — the public half is derived live from the private key. See
[backend/modules/bluesky-oauth/README.md](../../../backend/modules/bluesky-oauth/README.md) for the
design rationale and [`vouchington-infra` Operator Secrets Checklist § 2](https://github.com/vouchington/vouchington-infra/blob/main/opentofu/OPERATOR-SECRETS-CHECKLIST.md)
for the key-generation command.

| Name                                  | Required | Where | Notes                                                                                                                                                                                                                |
| ------------------------------------- | -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64` | Rollout  | SM    | Base64-encoded JSON array of EC P-256 JWKs. Injected into ECS only when `bluesky_jwt_private_keys_enabled = true`; unset in dev/test falls back to a bundled test key; production throws if enabled but unconfigured |
