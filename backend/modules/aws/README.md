# @modules/aws

AWS SDK wrappers for S3, SES, Bedrock, Firehose, and CloudWatch, with lazy-initialized clients and per-environment bucket name resolution.

## Exports

### S3

- `S3Buckets` — infrastructure-injected bucket names; Vitest alone uses identifier-free synthetic values
- `S3ImagesClient` — lazy-initialized S3 client for the images bucket
- `hasS3Credentials()` / `getS3Credentials()` — checks and returns S3 credentials from env vars

Local development supplies bucket names through `~/voucha.env`; deployed environments receive them
from OpenTofu. S3 credentials remain optional at startup; S3-backed features fail when used without
credentials. Deployed staging/production falls back to IAM task roles when explicit S3 credentials
are absent.

### SES

- `SESClient` — lazy-initialized SES client
- `sendEmail(options: SendEmailOptions)` — sends a transactional email via SES
- `hasSESCredentials()` / `getSESCredentials()` — checks and returns SES credentials from env vars

Local development uses explicit `SES_AWS_*` credentials (or shared `AWS_*` credentials as a
fallback). Test clients receive deterministic credentials. Deployed staging/production uses the
IAM task role managed by `vouchington/vouchington-infra`
through the AWS SDK default provider chain when explicit SES
credentials are absent.

### Bedrock

- `BedrockControlClient` — lazy-initialized Bedrock control-plane client for batch jobs
- `BedrockEmbeddingsClient` — lazy-initialized Bedrock Runtime client for single embeddings
- `hasBedrockCredentials()` / `getBedrockCredentials()` — checks and returns explicit Bedrock credentials from env vars for local development; ECS uses the infrastructure-managed task role via the default AWS credential chain when these env vars are absent

### S3 (Bedrock batch)

- `S3BedrockBatchClient` — lazy-initialized S3 client for the dedicated Bedrock batch I/O bucket,
  region-pinned to `BEDROCK_AWS_REGION` (Bedrock batch jobs require the job and its S3 bucket to
  be in the same region)
- `S3BedrockBatchBucket` — resolved bucket name for the current environment

### Firehose

- `FirehoseDeliveryClient` — lazy-initialized Kinesis Data Firehose client
- `putFirehoseRecordBatch(input)` — sends analytics batches to Firehose (tagged `/* no-mistakes: integration=aws */`)
- `hasFirehoseCredentials()` / `getFirehoseCredentials()` — checks optional local `FIREHOSE_AWS_*` credentials, falling back to shared `AWS_*`; ECS uses task roles when unset

### CloudWatch

- `CloudWatchMetricsClient` — lazy-initialized CloudWatch client using the default AWS credential chain
- `putCloudWatchMetricData(input)` — publishes one custom metric batch (tagged `/* no-mistakes: integration=aws */`)

### Config

- `AWS_REGION` — defaults to `'us-west-2'`
- `BEDROCK_AWS_REGION` — `'us-east-1'`

## Related

- Parent: [../README.md](../README.md)
- Local env vars: [../../../docs/development/local-env-vars.md](../../../docs/development/local-env-vars.md)
- Gmail SMTP alternative: [../gmail-smtp/README.md](../gmail-smtp/README.md)
