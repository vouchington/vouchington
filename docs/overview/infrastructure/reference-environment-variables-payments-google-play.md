# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Payments (Google Play)

| Name                                       | Where      | Purpose                                      |
| ------------------------------------------ | ---------- | -------------------------------------------- |
| `GOOGLE_PLAY_APPLICATION_ID`               | ECS        | Android package name for provider context    |
| `GOOGLE_PLAY_PUBSUB_AUDIENCE`              | ECS API    | Exact OIDC audience of the push subscription |
| `GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL` | ECS API    | Exact Pub/Sub push service-account identity  |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`        | ECS worker | Play Developer API publisher identity        |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY`  | SM worker  | Private key for worker OAuth assertions      |

Only the API receives the Pub/Sub audience and push identity; it validates notification JWTs
against worker-refreshed cached Google signing keys. Only workers receive the Play Developer API
credential and call Google. The corresponding private deployment setup is tracked in
[`vouchington-infra#248`](https://github.com/vouchington/vouchington-infra/issues/248).
