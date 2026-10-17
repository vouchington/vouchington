# Infrastructure

AWS infrastructure for staging and production environments is managed by OpenTofu in the private
[`vouchington-infra`](https://github.com/vouchington/vouchington-infra) repository. Vouchington owns
the application and publishes immutable deployment artifacts; it does not apply infrastructure or
mutate AWS or Cloudflare providers.

Docker images are pushed to ECR, where Fargate pulls and SOCI lazy loading are available. See [SOCI Lazy Loading](soci-lazy-loading.md). The ALB wires host-header listener rules from the active OpenTofu environment.

## Contents

- <a id="architecture-overview"></a>[Architecture Overview](reference-infrastructure-architecture-overview.md)
- <a id="ecs-services"></a>[ECS Services](reference-infrastructure-architecture-overview.md)
- <a id="aurora-serverless-v2"></a>[Aurora Serverless v2](reference-infrastructure-architecture-overview.md)
- <a id="valkey-strategy"></a>[Valkey Strategy](reference-infrastructure-architecture-overview.md)
- <a id="cloudfront--lambda-image-resize"></a>[CloudFront + Lambda (Image Resize)](reference-infrastructure-architecture-overview.md)
- <a id="s3-buckets"></a>[S3 Buckets](reference-infrastructure-s3-buckets.md)
- <a id="ses-email"></a>[SES (Email)](reference-infrastructure-s3-buckets.md)
- <a id="networking"></a>[Networking](reference-infrastructure-s3-buckets.md)
- <a id="developer-access"></a>[Developer Access](reference-infrastructure-s3-buckets.md)
- <a id="related"></a>[Related](reference-infrastructure-s3-buckets.md)
