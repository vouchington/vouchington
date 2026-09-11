export const PRIVATE_INFRA_ENV_REVIEW_REASONS = [
  [
    'CACHED_STATIC_PATHS',
    'Private infrastructure injects cache paths; local config has a safe default.',
  ],
  [
    'CSP_BROWSER_UPLOAD_ORIGINS',
    'Private infrastructure injects exact origins; local config uses synthetic origins.',
  ],
  ['S3_BUCKET_ASSETS', 'Private infrastructure injects the deployment bucket name.'],
  ['SITEMAPS_ORIGIN', 'Deployment origin is owned and injected by private infrastructure.'],
  ['SITE_ORIGIN', 'Canonical deployed origin is owned and injected by private infrastructure.'],
] as const
