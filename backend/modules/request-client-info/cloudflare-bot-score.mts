import type { IncomingMessage } from 'node:http'
import { VOUCHA_BOT_SCORE_HEADER } from '@ts-shared/utils/bot-challenge'
import { isAuthenticatedOriginRequest } from './authenticated-origin.mts'

/** Read Cloudflare metadata only after the origin guard authenticated the Worker transport. */
export function getTrustedCloudflareBotScore(request: IncomingMessage): number | undefined {
  if (!isAuthenticatedOriginRequest(request)) return undefined

  const raw = request.headers[VOUCHA_BOT_SCORE_HEADER]
  if (typeof raw !== 'string' || !/^(?:[1-9]|[1-9][0-9])$/.test(raw)) return undefined

  const score = Number(raw)
  return score >= 1 && score <= 99 ? score : undefined
}
