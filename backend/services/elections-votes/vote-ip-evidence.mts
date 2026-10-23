import { cachePrimaryValkeyClient } from '@data-stores/valkey/clients'
import { getDateFromUUIDv7 } from '@modules/utils'
import { TimeUnit } from '@valkey/valkey-glide'

const EVIDENCE_TTL_SECONDS = 2 * 60 * 60
const EVIDENCE_TTL_MS = EVIDENCE_TTL_SECONDS * 1_000

export function voteIpEvidenceKey(voteId: string): string {
  return `vote-integrity:ip-evidence:${voteId}`
}

/** The first IP for a ballot is immutable and expires no later than two hours after that vote. */
export async function storeVoteIpEvidence(
  voteId: string,
  ipAddress: string | null,
  now = new Date(),
): Promise<void> {
  if (!ipAddress) return
  const voteAt = getDateFromUUIDv7(voteId)
  if (!voteAt) throw new RangeError('Vote IP evidence requires a UUIDv7 ballot ID')
  const remainingMs = voteAt.getTime() + EVIDENCE_TTL_MS - now.getTime()
  if (!Number.isFinite(remainingMs)) throw new RangeError('Vote IP evidence time must be finite')
  const ttlSeconds = Math.min(EVIDENCE_TTL_SECONDS, Math.floor(remainingMs / 1_000))
  if (ttlSeconds < 1) return
  await cachePrimaryValkeyClient.set(voteIpEvidenceKey(voteId), ipAddress, {
    conditionalSet: 'onlyIfDoesNotExist',
    expiry: { type: TimeUnit.Seconds, count: ttlSeconds },
  })
}

/** A retry may read the same immutable evidence until its original expiry. */
export async function getVoteIpEvidence(voteId: string): Promise<string | null> {
  const value = await cachePrimaryValkeyClient.get(voteIpEvidenceKey(voteId))
  return value === null ? null : value.toString()
}
