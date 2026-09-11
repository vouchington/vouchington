# Configurable Inputs

[Back to Fediverse Staging Interoperability - Runbook](fediverse-staging-interop.md#configurable-inputs)

Record these values in a private operator worksheet. Do not commit credentials or access tokens.

| Input                                | Description                                                 |
| ------------------------------------ | ----------------------------------------------------------- |
| `STAGING_BASE_URL`                   | Deployed staging URL, normally `https://staging.voucha.ai`  |
| `DEPLOYED_SHA`                       | Exact web/API/worker revision under test                    |
| `VOUCHA_USER_ID` / `VOUCHA_USERNAME` | Dedicated staging user with federation enabled              |
| `MASTODON_HOST` / `MASTODON_VERSION` | Controlled Mastodon instance and exact version              |
| `LEMMY_HOST` / `LEMMY_VERSION`       | Controlled Lemmy instance and exact version                 |
| `PEERTUBE_HOST` / `PEERTUBE_VERSION` | Controlled PeerTube instance and exact version              |
| `*_REMOTE_ACTOR`                     | Controlled remote actor URI or account used for each test   |
| `*_INSTANCE_TOPIC_ID`                | Voucha instance-directory topic ID for each remote hostname |
| `EVIDENCE_UTC`                       | UTC timestamp for each observation                          |
