# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## AWS S3 Storage

| Name                                     | Required   | Where              | Notes                                                                                                                                                        |
| ---------------------------------------- | ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `S3_AWS_ACCESS_KEY_ID`                   | Feature    | SM + local         | AWS access key for S3-backed features (falls back to `AWS_ACCESS_KEY_ID`)                                                                                    |
| `S3_AWS_SECRET_ACCESS_KEY`               | Feature    | SM + local         | AWS secret key for S3-backed features (falls back to `AWS_SECRET_ACCESS_KEY`)                                                                                |
| `S3_AWS_SESSION_TOKEN`                   | Temporary  | SM + local         | Optional session token when using temporary S3 credentials                                                                                                   |
| `S3_BUCKET_IMAGES`                       | Yes        | ECS/Lambda + local | Infrastructure-injected images bucket; local development supplies its own value.                                                                             |
| `S3_BUCKET_IMAGE_UPLOADS`                | Yes        | ECS + local        | Browser-writable staging bucket for direct image uploads. The API promotes verified bytes to `S3_BUCKET_IMAGES`; the image Lambda remains final-bucket-only. |
| `S3_BUCKET_SITEMAPS`                     | Yes        | ECS + local        | Infrastructure-injected sitemaps bucket.                                                                                                                     |
| `S3_BUCKET_BEDROCK_BATCH`                | Yes        | ECS + local        | Infrastructure-injected, region-pinned Bedrock batch I/O bucket.                                                                                             |
| `S3_BUCKET_RENDERS`                      | Yes        | ECS/Lambda + local | Infrastructure-injected image-render bucket.                                                                                                                 |
| `S3_BUCKET_ASSETS`                       | Yes        | ECS + local        | Infrastructure-injected assets bucket.                                                                                                                       |
| `S3_BUCKET_CRAWLS`                       | Yes        | ECS + local        | Infrastructure-injected crawls bucket.                                                                                                                       |
| `S3_BUCKET_USER_EXPORTS`                 | Yes        | ECS + local        | Infrastructure-injected user-export bucket.                                                                                                                  |
| `S3_BUCKET_QUARANTINE`                   | Yes        | ECS + local        | Infrastructure-injected quarantine bucket.                                                                                                                   |
| `VOUCHA_SIDELOAD_SIGNING_KEYS_PARAMETER` | ECS/Lambda | Lambda             | SSM parameter name the image Lambda reads at runtime for sideload HMAC keys                                                                                  |

The backend and workers also use S3 for sitemap, crawl, image, and export storage. Local
`./dev/initialize web` no longer requires S3 credentials; S3-backed features fail with setup
guidance only when used without credentials. Bucket names have no application-source fallback:
OpenTofu injects deployed values, local development supplies user-local values, and Vitest uses
identifier-free synthetic names. See
[local-env-vars.md](../../development/local-env-vars.md).

## Media Delivery

Private infrastructure injects these five variables into both the API and worker tasks; the API and
the registry outbox worker read the same values. Their deployed values belong to the private
`vouchington-infra` repository and are intentionally not recorded here. The ordered procedure for
turning enforcement on is the
[media-delivery edge enforcement runbook](../../runbooks/media-delivery-edge-enforcement.md).

| Name                                          | Required         | Where                  | Notes                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEDIA_DELIVERY_REGISTRY_PUBLICATION_ENABLED` | Feature          | ECS backend and worker | Must be exactly `true`; the value is not trimmed or case-folded, and anything else leaves publication off. While off, no registry record publishes, so hosted images are not projected. While on, the three identifiers below must be set or publication throws.                                                                                        |
| `MEDIA_DELIVERY_EDGE_ENFORCEMENT_ENABLED`     | Feature          | ECS backend and worker | Must be exactly `true`. Turn it on only after every current placement has a completed registry record, because the edge denies any placement route without one. It requires publication, and the private infrastructure plan refuses it while publication is off. Copyright intake and legal media actions also refuse to run unless both flags are on. |
| `MEDIA_DELIVERY_REGISTRY_TABLE`               | With publication | ECS backend and worker | Name of the edge registry the viewer-request function reads and the publisher writes. Infrastructure owns the value.                                                                                                                                                                                                                                    |
| `MEDIA_DELIVERY_REGISTRY_REGION`              | With publication | ECS backend and worker | Region of that registry. The edge function executes in a fixed region, so this is independent of `AWS_REGION`.                                                                                                                                                                                                                                          |
| `MEDIA_DELIVERY_CLOUDFRONT_DISTRIBUTION_ID`   | With publication | ECS backend and worker | Image distribution whose cached route the publisher invalidates after each accepted registry write. Infrastructure owns the value.                                                                                                                                                                                                                      |
