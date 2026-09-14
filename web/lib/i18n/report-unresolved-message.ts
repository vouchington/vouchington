import * as Sentry from '@sentry/nextjs'

type UnresolvedMessageCapture = (
  error: Error,
  context: { tags: Record<string, string>; fingerprint: string[] },
) => void

export function createUnresolvedMessageReporter(
  locale: string,
  captureException: UnresolvedMessageCapture = (error, context) => {
    Sentry.captureException(error, context)
  },
): (key: string) => string {
  const reported = new Set<string>()
  return key => {
    if (!reported.has(key)) {
      reported.add(key)
      captureException(new Error(`Unresolvable message key "${key}"`), {
        tags: { i18n: 'unresolved-message', locale, key },
        fingerprint: ['i18n-unresolved-message', locale, key],
      })
    }
    return ''
  }
}
