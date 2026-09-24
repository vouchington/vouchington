import { PRIVATE_INFRA_ENV_REVIEW_REASONS } from './review-reasons-private-infra-env.mts'

export const ENV_REVIEW_REASONS = new Map<string, string>([
  ...PRIVATE_INFRA_ENV_REVIEW_REASONS,
  [
    'ADBLOCKER_CACHE_PATH',
    'Filesystem cache path; keep environment-scoped for local/runtime placement.',
  ],
  [
    'ANALYTICS_BACKEND',
    'Analytics backend selector; keep environment-scoped with deployment IAM/resources wiring.',
  ],
  [
    'ANALYTICS_LOCAL_DIR',
    'Filesystem output directory; keep environment-scoped for local placement.',
  ],
  ['API_EGRESS_PROXY_URL', 'Service Connect endpoint; keep with deployment network wiring.'],
  [
    'CLOUDFLARE_CF_FETCH_PATH',
    'Worker endpoint path; keep environment-scoped until route ownership changes.',
  ],
  [
    'CLOUDFLARE_IPV4_SOURCE_URL',
    'External source URL; keep environment-scoped for operator override.',
  ],
  [
    'CLOUDFLARE_IPV6_SOURCE_URL',
    'External source URL; keep environment-scoped for operator override.',
  ],
  ['DOCKER_HOST_IP', 'Local networking override; keep environment-scoped for developer machines.'],
  [
    'HSTS_PRELOAD',
    'Security header deployment flag; keep environment-scoped with rollout controls.',
  ],
  [
    'HARNESS_API_KEY',
    'Auto Harness secret; repository-scoped and explicitly forwarded per caller ' +
      '(auto-harness environment retained for branch-policy enforcement only, not secret storage).',
  ],
  ['HARNESS_FALLBACKS', 'Auto Harness fallbacks; operator-configurable via a repo variable.'],
  ['HARNESS_REPOSITORY_ID', 'Auto Harness repo id; operator-configurable via a repo variable.'],
  ['HARNESS_TARGET', 'Auto Harness dispatch target; operator-configurable via a repo variable.'],
  [
    'HARNESS_URL',
    'Exact Auto Harness HTTPS origin; keep operator-configurable through a repository variable.',
  ],
  [
    'LAMBDA_FUNCTION_URL',
    'Deployment endpoint; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'MINIFLARE_CACHE_DIR',
    'Local runtime cache path; keep environment-scoped for developer machines.',
  ],
  ['OUTPUT_PATH', 'Tool output path; keep environment-scoped for command invocation.'],
  ['PROD_DIR', 'Build artifact path; keep environment-scoped for command invocation.'],
  ['PUBLIC_URL', 'Public deployment URL; keep environment-scoped with deployment wiring.'],
  [
    'QUEUES',
    'Worker process topology selector; keep environment-scoped because it is read at startup.',
  ],
  [
    'RATE_LIMITER_ANON_GET_HEAD',
    'Cloudflare RateLimiter binding; keep environment-scoped for Worker binding configuration.',
  ],
  [
    'RATE_LIMITER_ANON_MUTATING',
    'Cloudflare RateLimiter binding; keep environment-scoped for Worker binding configuration.',
  ],
  [
    'RATE_LIMITER_BOT_GET_HEAD',
    'Cloudflare RateLimiter binding; keep environment-scoped for Worker binding configuration.',
  ],
  [
    'RATE_LIMITER_BOT_MUTATING',
    'Cloudflare RateLimiter binding; keep environment-scoped for Worker binding configuration.',
  ],
  [
    'RATE_LIMITER_GET_HEAD',
    'Rate limiter operation class; keep environment-scoped for runtime policy.',
  ],
  [
    'RATE_LIMITER_MUTATING',
    'Rate limiter operation class; keep environment-scoped for runtime policy.',
  ],
  [
    'RATE_LIMITER_SERVER_ACTION',
    'Cloudflare RateLimiter binding; keep environment-scoped for Worker binding configuration.',
  ],
  [
    'REGISTERED_WEB_CSP_ORIGINS',
    'Security policy origin allowlist; keep environment-scoped with deployment configuration.',
  ],
  ['RSS_CACHE_TTL_SECONDS', 'Runtime cache tuning; keep environment-scoped for operator override.'],
  [
    'S3_BUCKET_BEDROCK_BATCH',
    'Deployment bucket name; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'S3_BUCKET_CRAWLS',
    'Deployment bucket name; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'S3_BUCKET_SITEMAPS',
    'Deployment bucket name; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'S3_BUCKET_QUARANTINE',
    'Deployment bucket name; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'S3_BUCKET_USER_EXPORTS',
    'Deployment bucket name; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'S3_BUCKET_SES_INBOUND',
    'Deployment bucket name; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'S3_BUCKET_COPYRIGHT_EVIDENCE',
    'Immutable legal-evidence bucket; keep environment-scoped with infrastructure wiring.',
  ],
  [
    'COPYRIGHT_INTAKE_ENABLED',
    'Legal-operations activation gate; false unless all copyright launch prerequisites are ready.',
  ],
  [
    'STATIC_CACHE_TTL_SECONDS',
    'Runtime cache tuning; keep environment-scoped for operator override.',
  ],
  ['STORYBOOK_BASE_PATH', "Private infrastructure owns Storybook's deployment build path."],
  [
    'SUPPORT_EMAIL_ADDRESS',
    'Public contact address; keep environment-scoped for deployment override.',
  ],
  [
    'VALKEY_BLOOM_INFLIGHT_REQUESTS_LIMIT',
    'Runtime concurrency tuning for the dedicated bloom client; keep environment-scoped for operator override.',
  ],
  [
    'VALKEY_BLOOM_URL',
    'Valkey URL for dedicated bloom-filter ops; keep environment-scoped with deployment wiring.',
  ],
  [
    'VALKEY_INFLIGHT_RETRY_ATTEMPTS',
    'Runtime retry tuning for inflight-saturation errors; keep environment-scoped for operator override.',
  ],
  [
    'VALKEY_INFLIGHT_RETRY_DELAY_MS',
    'Base delay (ms) for valkyries internal ValkeyCache and RateLimiter saturation retry; keep environment-scoped for operator override.',
  ],
  [
    'VALKEY_REQUEST_TIMEOUT_MS',
    'Valkey client request budget read at client construction; keep environment-scoped for operator and test-harness override.',
  ],
  [
    'VOUCHA_TURNSTILE_SITE_KEY',
    'Native app public Turnstile site key override; keep environment-scoped for native runtime configuration.',
  ],
  [
    'WEB_INTEGRATION_ARTIFACTS_DIR',
    'Integration-test artifact path; keep environment-scoped for CI invocation.',
  ],
  [
    'WEB_INTEGRATION_BACKEND_ORIGIN',
    'Integration-test service origin; keep environment-scoped for local stack wiring.',
  ],
  [
    'WEB_INTEGRATION_IMAGE_ORIGIN',
    'Integration-test service origin; keep environment-scoped for local stack wiring.',
  ],
  [
    'WEB_INTEGRATION_TRACE_ORIGIN',
    'Integration-test service origin; keep environment-scoped for local stack wiring.',
  ],
  [
    'WEB_INTEGRATION_WEB_ORIGIN',
    'Integration-test service origin; keep environment-scoped for local stack wiring.',
  ],
  [
    'WEB_INTEGRATION_WORKER_ORIGIN',
    'Integration-test service origin; keep environment-scoped for local stack wiring.',
  ],
  ['WORKER_LOG_DIR', 'Runtime log path; keep environment-scoped for filesystem placement.'],
  ['WRANGLER_CACHE_DIR', 'Wrangler cache path; keep environment-scoped for developer machines.'],
  ['WRANGLER_LOG_PATH', 'Wrangler log path; keep environment-scoped for developer machines.'],
  [
    'WRANGLER_REGISTRY_PATH',
    'Wrangler registry path; keep environment-scoped for developer machines.',
  ],
  [
    'WRANGLER_SEND_ERROR_REPORTS',
    'Wrangler telemetry flag; keep environment-scoped for CLI invocation.',
  ],
])
