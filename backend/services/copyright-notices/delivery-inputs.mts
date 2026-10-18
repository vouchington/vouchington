import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { copyrightClaimantEmailSql, type CopyrightClaimantEmailRow } from './claimant-email.mts'
import {
  copyrightStatementFactsFromRows,
  copyrightStatementFactsSql,
  type CopyrightStatementAuthority,
  type CopyrightStatementFacts,
  type CopyrightStatementFactsRow,
} from './statement-of-reasons-facts.mts'
import {
  copyrightTargetPostersSql,
  type PosterPurpose,
  type TargetPoster,
} from './target-posters.mts'

export type CopyrightDeliveryInputs = {
  /** One entry per requested authority, in order. */
  facts: CopyrightStatementFacts[]
  parties: TargetPoster[]
  /** Still encrypted: decrypt it with `decryptCopyrightClaimantEmail` only when a claimant is told. */
  claimantEmail: CopyrightClaimantEmailRow | null
}

/**
 * The independent reads a statement delivery needs, in one round trip: the statement facts of
 * every authority, the recipients of every target and the claimant's recorded address. Callers
 * lock the notice first when they need a post-lock snapshot.
 */
export async function selectCopyrightDeliveryInputs(
  noticeId: string,
  transaction: TransactionQuery,
  request: {
    authorities: readonly CopyrightStatementAuthority[]
    targetIds: readonly string[]
    purposes: readonly PosterPurpose[]
  },
): Promise<CopyrightDeliveryInputs> {
  const { rows } = await transaction<{
    facts: CopyrightStatementFactsRow[]
    parties: TargetPoster[]
    claimant_email: CopyrightClaimantEmailRow | null
  }>(
    sql`/* selectCopyrightDeliveryInputs */
    SELECT
      (SELECT COALESCE(jsonb_agg(to_jsonb(facts) ORDER BY facts.position), '[]'::jsonb)
        FROM (`
      .append(copyrightStatementFactsSql(noticeId, request.authorities))
      .append(
        sql`) facts) AS facts,
      (SELECT COALESCE(jsonb_agg(to_jsonb(party) ORDER BY party.purpose DESC, party.target_id, party.user_id), '[]'::jsonb)
        FROM (`,
      )
      .append(copyrightTargetPostersSql(request.targetIds, request.purposes))
      .append(sql`) party) AS parties,
      (SELECT to_jsonb(email) FROM (`)
      .append(copyrightClaimantEmailSql(noticeId)).append(sql`) email) AS claimant_email
  `),
  )
  const row = rows[0]!
  return {
    facts: copyrightStatementFactsFromRows(noticeId, row.facts, request.authorities.length),
    parties: row.parties,
    claimantEmail: row.claimant_email,
  }
}
