import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readEffectiveReviewState } from './copyright-effective-review-state.mts'
import { readCopyrightApiTerritorialState } from './copyright-api-territorial-request-outcomes.mts'
import { territorialLabels } from '../services/copyright-notices/territorial-labels.mts'

/** Owned parent/source histories plus complete legal/account effects and the legal clock. */
export async function readTerritorialReviewState(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
  accountIds: string[],
) {
  const [
    api,
    effective,
    { rows: history },
    { rows: identities },
    { rows: placements },
    { rows: rationales },
  ] = await Promise.all([
    readCopyrightApiTerritorialState(noticeId),
    readEffectiveReviewState(noticeId, accountIds),
    write<{
      id: string
      request: string
      actor: string
      disposition: string
      at: Date
      rationale: string
    }>(sql`/* readTerritorialReviewState:history */ SELECT decision.id, decision.copyright_territorial_redress_request_id AS request,
      decision.decided_by_id AS actor, decision.staff_disposition AS disposition, decision.decided_at AS at, decision.rationale_ciphertext AS rationale
      FROM copyright_territorial_redress_decisions decision JOIN copyright_territorial_redress_requests request ON request.id = decision.copyright_territorial_redress_request_id
      WHERE request.copyright_notice_id = ${noticeId} ORDER BY decision.id`),
    write<{
      id: string
      request: string
    }>(sql`/* readTerritorialReviewState:identities */ SELECT identity.id, identity.copyright_territorial_redress_request_id AS request
      FROM copyright_territorial_redress_decision_identities identity JOIN copyright_territorial_redress_requests request ON request.id = identity.copyright_territorial_redress_request_id
      WHERE request.copyright_notice_id = ${noticeId} ORDER BY identity.id`),
    write<{
      id: string
      revision: number
      withheld: boolean
    }>(sql`/* readTerritorialReviewState:placements */
      SELECT placement.id, placement.revision, placement.copyright_withheld_at IS NOT NULL AS withheld FROM media_placements placement
      JOIN copyright_notice_targets target ON target.placement_id = placement.id
      WHERE target.copyright_notice_id = ${noticeId} ORDER BY placement.id`),
    write<{
      id: string
      rationale: string | null
    }>(sql`/* readTerritorialReviewState:requestRationales */
        SELECT id, rationale_ciphertext AS rationale FROM copyright_territorial_redress_requests WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
  ])
  const {
    actionIntents: _actions,
    deliveryIntents: _deliveries,
    correspondence: _correspondence,
    lifecycleEvents: _events,
    ...untouched
  } = api.aggregate
  return {
    effective,
    placements,
    untouched,
    parent: api.parent,
    decisions: api.decisions,
    acknowledgments: api.acknowledgments,
    clock: api.clock,
    holds: api.holds,
    complaints: api.complaints,
    escalations: api.escalations,
    requests: api.requests.map(row => {
      const current = rationales.find(candidate => candidate.id === row.id)
      if (!current) throw new Error('Owned complaint current rationale disappeared')
      return {
        ...row,
        decodedRationale:
          current.rationale === null
            ? null
            : decryptSecret(
                current.rationale,
                `${territorialLabels(jurisdiction).redressDecisionPurpose}:${row.id}`,
              ),
      }
    }),
    identities,
    history: history.map(row => ({
      ...row,
      rationale: decryptSecret(
        row.rationale,
        `${territorialLabels(jurisdiction).redressDecisionPurpose}:${row.request}`,
      ),
    })),
  }
}
