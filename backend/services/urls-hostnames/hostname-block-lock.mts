/** Kept so existing SQL call sites still interpolate a lock-free expression. */
export function hostnameBlockStripeAdvisoryLock(_idSql: string): string {
  return 'TRUE'
}

/** Kept so existing SQL call sites still interpolate a lock-free statement. */
export function hostnameBlockStripeSetLockSql(_sourceSql: string, _idSql: string): string {
  return 'SELECT 1 WHERE FALSE'
}
