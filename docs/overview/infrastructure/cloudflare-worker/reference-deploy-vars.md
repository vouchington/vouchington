# Deploy Vars

[Back to Cloudflare Worker](README.md#deploy-vars)

`wrangler.local.jsonc` is identifier-free local-development configuration. Deployed plain variables,
routes, bindings, names, and provider identifiers are owned by `vouchington/vouchington-infra` and
must not be copied back into this repository.

Private staging deploys mirror `VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64` and `CF_WORKER_SECRET` from their
authoritative SSM parameters. Rotate the SSM values, restart ECS consumers, and then deploy the
Worker through the private receiver; never independently generate or rotate the Worker copies.
Staging Basic Auth remains an encrypted Worker secret and must not be copied into GitHub Actions or
SSM.
