import { cacheValkeyClient } from '@data-stores/valkey/clients'
import { loadScript, registerScript } from '@data-stores/valkey/scripts'
import { hashToken } from '@modules/token-secrets'
import { IP_CORRELATION_WINDOW_MINUTES } from './config.mts'

const IP_WINDOW_TTL_SECONDS = 2 * 60 * 60
const recordScript = registerScript(loadScript('record-ip-window.lua', import.meta.url))

function keyFor(entityType: string, entityId: string, ipAddress: string): string {
  const ipDigest = hashToken('vote-integrity-ip-window', ipAddress)
  return `vote-integrity:ip:${entityType}:${entityId}:${ipDigest}`
}

/** One member per voter keeps the 60-minute distinct-user check exact and bounded by TTL. */
export async function recordVoteIp(
  entityType: string,
  entityId: string,
  userId: string,
  ipAddress: string | null,
  voteAt: Date,
  asOf = new Date(),
): Promise<void> {
  if (!ipAddress) return
  const voteAtMs = voteAt.getTime()
  const asOfMs = asOf.getTime()
  if (!Number.isFinite(voteAtMs) || !Number.isFinite(asOfMs)) {
    throw new RangeError('Vote IP timestamps must be finite dates')
  }
  await cacheValkeyClient.invokeScript(recordScript, {
    keys: [keyFor(entityType, entityId, ipAddress)],
    args: [
      userId,
      String(voteAtMs),
      String(asOfMs - IP_CORRELATION_WINDOW_MINUTES * 60_000),
      String(IP_WINDOW_TTL_SECONDS),
    ],
  })
}

export async function countDistinctVoteUsersForIp(
  entityType: string,
  entityId: string,
  ipAddress: string,
  asOf: Date,
): Promise<number> {
  const asOfMs = asOf.getTime()
  if (!Number.isFinite(asOfMs)) throw new RangeError('asOf must be a finite date')
  return cacheValkeyClient.zcount(
    keyFor(entityType, entityId, ipAddress),
    { value: asOfMs - IP_CORRELATION_WINDOW_MINUTES * 60_000, isInclusive: true },
    { value: asOfMs, isInclusive: true },
  )
}
