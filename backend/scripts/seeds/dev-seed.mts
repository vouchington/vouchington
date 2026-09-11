/**
 * Development seed — populates a local database with sample topics, articles,
 * and RSS feeds from the seed CSVs.
 *
 * **Local development only.** This script must never run in staging or production.
 * Invariant data (system users, admin user, blacklist sources, communities, publisher-type
 * topics) is seeded by config-driven generators that run on every `db:migrate`.
 *
 * Idempotent: uses service-layer upserts so re-runs are safe.
 *
 * Run: pnpm run db:seed (from repo root or backend/)
 */

export function assertNotProdOrStaging(env: string | undefined): boolean {
  if (env === 'production' || env === 'staging') {
    process.stderr.write(
      `db:seed must not run in ${env}. Invariant data is seeded by config-driven generators (db:migrate).\n`,
      /* v8 ignore next */
      () => process.exit(1),
    )
    return false
  }
  return true
}

/* v8 ignore start -- entry-point bootstrap: dynamic import and process.exit not covered by unit tests */
if (!process.env['VITEST'] && assertNotProdOrStaging(process.env['NODE_ENV'])) {
  import('@voucha/scripts/seed')
    .then(({ default: seed }) => seed())
    .then(() => process.exit(0))
    .catch(error => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
        () => process.exit(1),
      )
    })
}
/* v8 ignore stop */
