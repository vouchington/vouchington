/* eslint-disable max-lines -- The contract table is intentionally centralized for cross-surface review. */

import {
  envContractsByName as groupEnvContractsByName,
  envNamesBySensitivity,
  envNamesForSurface as findEnvNamesForSurface,
  groupEnvContracts as group,
  normalizeEnvContractGroups,
} from '@vouchington/utils/env-contract'

export type EnvVarSensitivity = 'internal' | 'public' | 'secret'

export type EnvVarSourceOfTruth =
  | 'cloudflare-worker'
  | 'github-actions'
  | 'local-init'
  | 'vouchington-infra'
  | 'runtime-public-config'
  | 'web-build'

export type EnvVarSurface =
  | 'cloudflare-staging-vars'
  | 'ecs-backend-environment'
  | 'ecs-backend-rollout-secret'
  | 'ecs-backend-secret'
  | 'ecs-web-environment'
  | 'ecs-web-secret'
  | 'ecs-worker-environment'
  | 'ecs-worker-rollout-secret'
  | 'ecs-worker-secret'
  | 'lambda-image-resize'
  | 'local-web'
  | 'local-worker'
  | 'local-worktree'
  | 'web-build-arg'

export interface EnvVarContract {
  key: string
  name: string
  sensitivity: EnvVarSensitivity
  sourceOfTruth: EnvVarSourceOfTruth
  surfaces: readonly EnvVarSurface[]
}

export interface EnvVarContractGroup {
  sourceOfTruth: EnvVarSourceOfTruth
  surfaces: readonly EnvVarSurface[]
  sensitivity: EnvVarSensitivity
  names: readonly string[]
}

export const ENV_VAR_CONTRACT_GROUPS = [
  group(
    'local-init',
    'internal',
    ['local-worktree'],
    [
      'NODE_ENV',
      'ENVIRONMENT',
      'PORT',
      'DATABASE_URL',
      'VALKEY_URL',
      'VALKEY_SESSION_URL',
      'VALKEY_CACHE_URL',
      'VALKEY_RATE_LIMITER_URL',
      'VALKEY_DYNAMIC_CONFIG_URL',
      'VALKEY_WORKER_QUEUE_URL',
      'VALKEY_CONTAINER',
      'NEXT_PUBLIC_API_BASE_URL',
      'NEXT_PORT',
      'WORKER_PORT',
      'IMAGE_LAMBDA_PORT',
      'IMAGE_ORIGIN',
      'INSPECTOR_PORT',
      'CF_WORKER_SECRET',
      'API_KEY_CHECKSUM_SECRET',
      'WEB_PUSH_PUBLIC_KEY',
      'WEB_PUSH_PRIVATE_KEY',
      'WEB_PUSH_SUBJECT',
      'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY',
      'SITEMAP_BASE_URL',
      'CF_WORKER_ROUTE',
      'API_BASE_URL',
      'LIGHTPANDA_CDP_URL',
    ],
  ),
  group(
    'local-init',
    'internal',
    ['local-web'],
    [
      'NEXT_PUBLIC_API_BASE_URL',
      'API_BASE_URL',
      'SITEMAP_BASE_URL',
      'NEXT_PUBLIC_ASSET_PREFIX',
      'IMAGE_ORIGIN',
      'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY',
      'CF_WORKER_SECRET',
      'NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY',
    ],
  ),
  group(
    'local-init',
    'internal',
    ['local-worker'],
    [
      'BACKEND_ORIGIN',
      'WEB_ORIGIN',
      'CSP_ASSET_ORIGIN',
      'CF_WORKER_SECRET',
      'DEV_WEBSOCKET_PROXY',
      'PRODUCTION',
    ],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-backend-environment'],
    [
      'NODE_ENV',
      'ENVIRONMENT',
      'PORT',
      'GIT_COMMIT',
      'WEB_PUSH_SUBJECT',
      'SITEMAP_BASE_URL',
      'CF_WORKER_ROUTE',
      'ANALYTICS_BACKEND',
      'ANALYTICS_FIREHOSE_PREFIX',
      'INSTANCE_EMAIL',
      'DATABASE_HOST',
      'DATABASE_NAME',
      'DATABASE_USER',
      'DATABASE_SSLMODE',
      'NODE_OPTIONS',
      'UV_THREADPOOL_SIZE',
      'RUST_TOKIO_WORKER_THREADS',
      'RUST_TOKIO_MAX_BLOCKING_THREADS',
      'RAYON_NUM_THREADS',
    ],
  ),
  group(
    'vouchington-infra',
    'public',
    ['ecs-backend-environment', 'ecs-worker-environment'],
    [
      'IMAGE_ORIGIN',
      'GOOGLE_RECAPTCHA_PROJECT_ID',
      'GOOGLE_RECAPTCHA_SITE_KEY',
      'APPLE_CLIENT_ID',
      'APPLE_NATIVE_CLIENT_IDS',
      'APPLE_APP_STORE_APPLICATION_ID',
      'APPLE_APP_STORE_APP_ID',
      'GOOGLE_PLAY_APPLICATION_ID',
      'MICROSOFT_STORE_APPLICATION_ID',
      'GOOGLE_CLIENT_ID',
      'GITHUB_CLIENT_ID',
      'FACEBOOK_APP_ID',
      'X_CLIENT_ID',
      'LINKEDIN_CLIENT_ID',
      'MICROSOFT_CLIENT_ID',
      'MICROSOFT_TENANT_ID',
      'STRIPE_PUBLISHABLE_KEY',
      'WEB_PUSH_PUBLIC_KEY',
    ],
  ),
  group(
    'vouchington-infra',
    'public',
    ['ecs-backend-environment'],
    ['APPLE_APP_ATTEST_TEAM_ID', 'APPLE_APP_ATTEST_BUNDLE_ID'],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-backend-environment', 'ecs-worker-environment'],
    [
      'SES_CONFIGURATION_SET_TRANSACTIONAL',
      'SES_CONFIGURATION_SET_MARKETING',
      'MARKETING_POSTAL_ADDRESS',
    ],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-worker-environment'],
    [
      'APPLE_APP_STORE_SERVER_API_ISSUER_ID',
      'APPLE_APP_STORE_SERVER_API_KEY_ID',
      'GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL',
    ],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-backend-environment'],
    ['GOOGLE_PLAY_PUBSUB_AUDIENCE', 'GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT_EMAIL'],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-backend-environment', 'ecs-worker-environment'],
    ['MICROSOFT_STORE_TENANT_ID', 'MICROSOFT_STORE_CLIENT_ID'],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-backend-environment', 'ecs-worker-environment'],
    ['PG_QUERY_TIMING_SAMPLE', 'PG_POOL_STATS_INTERVAL_MS'],
  ),
  group('vouchington-infra', 'internal', ['ecs-backend-environment'], ['COPYRIGHT_INTAKE_ENABLED']),
  group(
    'vouchington-infra',
    'secret',
    ['ecs-backend-secret', 'ecs-worker-secret'],
    [
      'DATABASE_URL',
      'DATABASE_PASSWORD',
      'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64',
      'VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64',
      'CF_WORKER_SECRET',
      'VALKEY_SESSION_URL',
      'VALKEY_CACHE_URL',
      'VALKEY_RATE_LIMITER_URL',
      'VALKEY_DYNAMIC_CONFIG_URL',
      'VALKEY_WORKER_QUEUE_URL',
      'OPENAI_API_KEY',
      'OPENROUTER_API_KEY',
      'CLOUDFLARE_TURNSTILE_SECRET_KEY',
      'GOOGLE_RECAPTCHA_API_KEY',
      'GITHUB_CLIENT_SECRET',
      'FACEBOOK_APP_SECRET',
      'X_CLIENT_SECRET',
      'LINKEDIN_CLIENT_SECRET',
      'MICROSOFT_CLIENT_SECRET',
      'MICROSOFT_STORE_CLIENT_SECRET',
      'STRIPE_SECRET_KEY',
      'WEB_PUSH_PRIVATE_KEY',
      'VOUCHA_SIDELOAD_SIGNING_KEYS',
      'API_KEY_CHECKSUM_SECRET',
      'VOUCHA_OTP_TOKEN_HASH_SECRET',
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
    ],
  ),
  group(
    'vouchington-infra',
    'secret',
    ['ecs-worker-secret'],
    [
      'APPLE_APP_STORE_SERVER_API_PRIVATE_KEY',
      'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY',
      'GRAFANA_IRM_HEARTBEAT_URL',
    ],
  ),
  group(
    'vouchington-infra',
    'secret',
    ['ecs-backend-rollout-secret', 'ecs-worker-rollout-secret'],
    ['VOUCHA_BLUESKY_JWT_PRIVATE_KEYS_B64'],
  ),
  group('vouchington-infra', 'secret', ['ecs-worker-rollout-secret'], ['LIGHTPANDA_TOKEN']),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-worker-environment'],
    [
      'NODE_ENV',
      'ENVIRONMENT',
      'PORT',
      'GIT_COMMIT',
      'WEB_PUSH_SUBJECT',
      'BEDROCK_BATCH_ROLE_ARN',
      'BEDROCK_BATCH_SQS_QUEUE_URL',
      'SES_BOUNCE_SQS_QUEUE_URL',
      'SES_INBOUND_SQS_QUEUE_URL',
      'STRIPE_EVENTS_SQS_QUEUE_URL',
      'SITEMAP_BASE_URL',
      'ANALYTICS_BACKEND',
      'ANALYTICS_FIREHOSE_PREFIX',
      'S3_BUCKET_SES_INBOUND',
      'S3_BUCKET_COPYRIGHT_EVIDENCE',
      'INSTANCE_EMAIL',
      'QUEUES',
      'CF_WORKER_ROUTE',
      'DATABASE_HOST',
      'DATABASE_NAME',
      'DATABASE_USER',
      'DATABASE_SSLMODE',
      'LIGHTPANDA_CDP_URL',
      'NODE_OPTIONS',
      'UV_THREADPOOL_SIZE',
      'RUST_TOKIO_WORKER_THREADS',
      'RUST_TOKIO_MAX_BLOCKING_THREADS',
      'RAYON_NUM_THREADS',
    ],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['ecs-web-environment'],
    [
      'NODE_ENV',
      'ENVIRONMENT',
      'PORT',
      'GIT_COMMIT',
      'WEB_PUSH_SUBJECT',
      'SITEMAP_BASE_URL',
      'IMAGE_ORIGIN',
      'API_BASE_URL',
      'NODE_OPTIONS',
      'UV_THREADPOOL_SIZE',
    ],
  ),
  group(
    'vouchington-infra',
    'public',
    [
      'ecs-backend-environment',
      'ecs-worker-environment',
      'ecs-web-environment',
      'lambda-image-resize',
    ],
    ['SENTRY_DSN'],
  ),
  group(
    'runtime-public-config',
    'public',
    ['ecs-web-environment'],
    [
      'NEXT_PUBLIC_APPLE_CLIENT_ID',
      'NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY',
      'NEXT_PUBLIC_FACEBOOK_APP_ID',
      'NEXT_PUBLIC_GITHUB_CLIENT_ID',
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
      'NEXT_PUBLIC_GOOGLE_RECAPTCHA_SITE_KEY',
      'NEXT_PUBLIC_GTM_ID',
      'NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH',
      'NEXT_PUBLIC_LINKEDIN_CLIENT_ID',
      'NEXT_PUBLIC_MICROSOFT_CLIENT_ID',
      'NEXT_PUBLIC_MICROSOFT_TENANT_ID',
      'NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY',
      'NEXT_PUBLIC_X_CLIENT_ID',
      'SENTRY_WEB_DSN',
    ],
  ),
  group(
    'vouchington-infra',
    'secret',
    ['ecs-web-secret'],
    ['CF_WORKER_SECRET', 'VOUCHA_SIDELOAD_SIGNING_KEYS'],
  ),
  group(
    'web-build',
    'public',
    ['web-build-arg'],
    ['NEXT_PUBLIC_GIT_COMMIT', 'NEXT_PUBLIC_ASSET_PREFIX', 'STRIP_TEST_IDS'],
  ),
  group(
    'vouchington-infra',
    'internal',
    ['lambda-image-resize'],
    ['NODE_ENV', 'ENVIRONMENT', 'GIT_COMMIT', 'VOUCHA_SIDELOAD_SIGNING_KEYS_PARAMETER'],
  ),
  group(
    'cloudflare-worker',
    'internal',
    ['cloudflare-staging-vars'],
    [
      'SITE_ORIGIN',
      'SITEMAPS_ORIGIN',
      'NOINDEX',
      'PRODUCTION',
      'ENVIRONMENT',
      'SITEMAP_CACHE_TTL_SECONDS',
      'BOT_CACHE_TTL_SECONDS',
      'ANON_CACHE_TTL_SECONDS',
      'CACHED_STATIC_PATHS',
      'GEO_BLOCKED_COUNTRIES',
    ],
  ),
  group(
    'cloudflare-worker',
    'public',
    ['cloudflare-staging-vars'],
    ['SENTRY_DSN', 'SENTRY_TUNNEL_PREVIOUS_WEB_DSN', 'SENTRY_WEB_DSN'],
  ),
] as const satisfies readonly EnvVarContractGroup[]

export const ENV_VAR_CONTRACT = normalizeEnvContractGroups(ENV_VAR_CONTRACT_GROUPS)

export const typedEnvContractEntries = ENV_VAR_CONTRACT.map(entry => ({
  name: entry.name,
  contractKey: entry.key,
  sourceOfTruth: entry.sourceOfTruth,
  sensitivity: entry.sensitivity,
  runtimeSurfaces: [...entry.surfaces],
}))

export const typedEnvVarConstants = {
  ENCRYPTION_KEYS_ENV: 'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
  ENV_PREFIX: 'WORKER_CONCURRENCY_',
  HASH_ENV: 'VOUCHA_OTP_TOKEN_HASH_SECRET',
  MAX_ENV: 'WORKER_CONCURRENCY_MAX',
  SCALE_ENV: 'WORKER_CONCURRENCY_SCALE',
  SIDELOAD_SIGNING_KEYS_ENV: 'VOUCHA_SIDELOAD_SIGNING_KEYS',
} as const

export function collectTypedEnvContractEntries(): typeof typedEnvContractEntries {
  return typedEnvContractEntries
}

export function collectTypedEnvVarConstants(): typeof typedEnvVarConstants {
  return typedEnvVarConstants
}

export function envNamesForSurface(surface: EnvVarSurface): readonly string[] {
  return findEnvNamesForSurface(ENV_VAR_CONTRACT, surface)
}

export function envContractsByName(): ReadonlyMap<string, readonly EnvVarContract[]> {
  return groupEnvContractsByName(ENV_VAR_CONTRACT)
}

export function knownPublicEnvNames(): readonly string[] {
  return namesBySensitivity('public')
}

export function knownSecretEnvNames(): readonly string[] {
  return namesBySensitivity('secret')
}

function namesBySensitivity(sensitivity: EnvVarSensitivity): readonly string[] {
  return envNamesBySensitivity(ENV_VAR_CONTRACT, sensitivity).toSorted((a, b) => a.localeCompare(b))
}
