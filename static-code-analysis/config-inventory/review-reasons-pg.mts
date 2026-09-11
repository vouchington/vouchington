export const PG_ENV_REVIEW_REASONS = new Map<string, string>([
  [
    'PG_ADVISORY_LOCK_POOL_MAX',
    'Postgres advisory-lock pool size read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_CONNECTION_TIMEOUT_MS',
    'Postgres pool connect timeout read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_MIGRATION_CONNECT_RETRY_ATTEMPTS',
    'Migration connect-retry count read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_MIGRATION_CONNECT_RETRY_DELAY_MS',
    'Migration connect-retry delay read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_MIGRATION_LOCK_TIMEOUT_MS',
    'Migration lock timeout read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_MIGRATION_STATEMENT_TIMEOUT_MS',
    'Migration statement timeout read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_POOL_MAX',
    'Postgres pool size fallback read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_READ_POOL_MAX',
    'Postgres read-pool size read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
  [
    'PG_WRITE_POOL_MAX',
    'Postgres write-pool size read by @vouchington/postgres at process start; keep environment-scoped.',
  ],
])
