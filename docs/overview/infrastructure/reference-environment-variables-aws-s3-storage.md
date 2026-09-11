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
