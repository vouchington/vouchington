import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { copyrightReplayDigestCandidates } from './replay-identity-hmac.mts'

export type CopyrightReplayFamily =
  | 'form_notice'
  | 'submission'
  | 'territorial_notice'
  | 'territorial_redress'
  | 'territorial_acknowledgment'
export type CopyrightReplayInput = {
  family: CopyrightReplayFamily
  jurisdiction: 'us_dmca' | 'eu_dsa' | 'uk'
  identity: string
  requester: string
  request: string
}

/** Every configured candidate participates in one deterministic lock order across active-slot flips. */
export async function lockCopyrightReplayAdmission(
  query: TransactionQuery,
  input: CopyrightReplayInput,
) {
  const scoped = JSON.stringify([input.family, input.jurisdiction, input.identity])
  const candidates = copyrightReplayDigestCandidates('idempotency', scoped)
  const requesters = new Map(
    copyrightReplayDigestCandidates('requester', input.requester).map(value => [
      value.keyId,
      value.digest,
    ]),
  )
  const requests = new Map(
    copyrightReplayDigestCandidates('request', input.request).map(value => [
      value.keyId,
      value.digest,
    ]),
  )
  const slots = candidates.map(candidate => ({
    ...candidate,
    requester: requesters.get(candidate.keyId)!,
    request: requests.get(candidate.keyId)!,
  }))
  const locks = slots
    .map(
      slot =>
        `copyright-replay:${input.family}:${input.jurisdiction}:${slot.keyId}:${slot.digest.toString('hex')}`,
    )
    .toSorted()
  await query(sql`/* lockAllCopyrightReplayCandidates */
    SELECT pg_advisory_xact_lock(hashtextextended(identity, 0)) FROM (
      SELECT identity FROM unnest(${locks}::text[]) candidate(identity) ORDER BY identity) ordered`)
  return slots
}

export type CopyrightReplayOutcomeCode =
  | 'notice_received'
  | 'submission_received'
  | 'redress_received'
  | 'acknowledgment_recorded'
