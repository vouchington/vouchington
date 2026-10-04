import { write } from '@data-stores/psql'
import { getUserRateLimitContext } from '@services/user-rate-limits/context'
import { computeTrustTier, getAccountAgeMs } from '@services/user-rate-limits/trust-tier'
import { getPrivateUserByAny } from '@services/users/get'
import sql from 'sql-template-strings'
import type { AutomaticWithholdingWindow } from './automatic-withholding-since.mts'
import {
  type AutomaticWithholdingThresholds,
  getAutomaticWithholdingThresholds,
} from './config.mts'

export type AutomaticWithholdingRefusalReason =
  | 'thresholds_unset'
  | 'switch_on_unrecorded'
  | 'received_before_switch_on'
  | 'claimant_unavailable'
  | 'claimant_suspended'
  | 'trust_below_minimum'
  | 'account_too_new'
  | 'claimant_daily_cap'
  | 'poster_daily_cap'
  | 'non_post_target'

export type AutomaticWithholdingEligibility =
  | { reason: AutomaticWithholdingRefusalReason }
  | { reason: null; claimantId: string; thresholds: AutomaticWithholdingThresholds }

type ClaimantRow = {
  received_at: Date
  claimant_id: string | null
  suspended: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The gates that do not depend on other notices: the operator-approved thresholds exist, the
 * submission arrived during the current on-period, and the claimant is a live, unsuspended account
 * that clears the account-age and trust minimums. A reason means a moderator must decide; the
 * notice is never dropped. Caps are checked separately, under locks, because they depend on
 * concurrent notices.
 */
export async function checkAutomaticWithholdingEligibility(
  submissionId: string,
  window: AutomaticWithholdingWindow,
): Promise<AutomaticWithholdingEligibility> {
  const thresholds = await getAutomaticWithholdingThresholds()
  if (!thresholds) return { reason: 'thresholds_unset' }
  if (!window.since) return { reason: 'switch_on_unrecorded' }
  const claimant = await readClaimant(submissionId)
  if (!claimant) return { reason: 'claimant_unavailable' }
  if (claimant.received_at < window.since) return { reason: 'received_before_switch_on' }
  if (!claimant.claimant_id) return { reason: 'claimant_unavailable' }
  if (claimant.suspended) return { reason: 'claimant_suspended' }
  const user = await getPrivateUserByAny(claimant.claimant_id)
  if (!user) return { reason: 'claimant_unavailable' }
  if (getAccountAgeMs(user) < thresholds.minAccountAgeDays * DAY_MS) {
    return { reason: 'account_too_new' }
  }
  const tier = computeTrustTier(user, await getUserRateLimitContext(user.id))
  if (tier < thresholds.minTrustTier) return { reason: 'trust_below_minimum' }
  return { reason: null, claimantId: claimant.claimant_id, thresholds }
}

async function readClaimant(submissionId: string): Promise<ClaimantRow | undefined> {
  const { rows } = await write<ClaimantRow>(sql`/* readAutomaticWithholdingClaimant */
    SELECT submission.received_at,
      account.id AS claimant_id,
      EXISTS (
        SELECT 1 FROM user_suspensions suspension
        WHERE suspension.user_id = notice.claimant_user_id AND suspension.lifted_at IS NULL
      ) AS suspended
    FROM copyright_notice_submissions submission
    JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    LEFT JOIN users account ON account.id = notice.claimant_user_id AND account.deleted_at IS NULL
    WHERE submission.id = ${submissionId}
  `)
  return rows[0]
}
