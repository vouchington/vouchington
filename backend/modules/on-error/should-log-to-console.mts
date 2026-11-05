import { sentryEnabled } from './sentry.mts'

// Log when Sentry is disabled, in development or CI, but never in test mode.
// Shared by the barrel and the named recorders, and not re-exported from index.mts.
export function shouldLogToConsole(): boolean {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'test') return false
  return !sentryEnabled || env === 'development' || !!process.env.CI
}
