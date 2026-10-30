/** True when this process may populate a development database. */
export function devSeedAllowed(env: string | undefined): boolean {
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
