import { VOUCHA_BOT_SCORE_HEADER } from '@ts-shared/utils/bot-challenge'

export function buildWebClientInfoHeaders(): Record<string, string> {
  return {
    'x-voucha-client': 'web',
    'x-voucha-platform': 'web',
    'x-voucha-app-version':
      process.env.NEXT_PUBLIC_GIT_COMMIT || process.env.GIT_COMMIT || 'development',
  }
}

export function withoutPrivateWorkerHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        name.toLowerCase() !== VOUCHA_BOT_SCORE_HEADER &&
        name.toLowerCase() !== 'x-voucha-client-ja4',
    ),
  )
}
