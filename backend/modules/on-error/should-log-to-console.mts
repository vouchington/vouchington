// Log to console when Sentry is disabled (development, CI) but not in test mode.
// Shared by the barrel and the named recorders, and not re-exported from index.mts.
export function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return env === 'development' || !!process.env.CI
}
