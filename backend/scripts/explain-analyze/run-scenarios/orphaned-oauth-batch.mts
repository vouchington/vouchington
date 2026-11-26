import { write } from '@data-stores/psql'
import { cleanupOrphanedOAuthAccounts } from '@services/data-retention/cleanup-orphaned-oauth-accounts'
import { providerTableConfigs } from '@services/oauth/providers'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { resolveSeedAnchor, SEED_ANCHOR_DATE_ENV } from '../seed-data/seed-anchor.mts'

const DAY_MS = 86_400_000
const ORPHAN_KEY_PREFIX = 'explain-orphan-batch-'
// Hash and merge joins, materialization and hash aggregation hide a rescanned pick; with them
// off the planner shows whether the limited subquery sits under a join that re-reads it.
export const FORCE_RESCAN_SETTINGS = {
  enable_hashjoin: 'off',
  enable_mergejoin: 'off',
  enable_material: 'off',
  enable_hashagg: 'off',
  enable_sort: 'off',
}

/** The delete's LIMIT 1 pick must run once, so one statement never affects more than batchSize rows. */
export async function runOrphanedOAuthBatchScenarios(): Promise<void> {
  registerScenarioContract('orphaned-oauth-account-batch-pick-once', {
    expectations: [
      { kind: 'custom', name: 'batchPickEvaluatedOnce' },
      { kind: 'maxProcessedRows', relation: 'facebook_accounts', max: 100 },
    ],
    // A DELETE without RETURNING reports no root rows.
    allowEmptyResult: true,
  })
  const providers = Object.keys(providerTableConfigs)
  const anchorDay = Math.floor(
    resolveSeedAnchor(process.env[SEED_ANCHOR_DATE_ENV]).dayAnchorMs / DAY_MS,
  )
  // Daily rotation starts at provider (utcDay mod count); start the run at facebook.
  const startOffset =
    (providers.indexOf('facebook') - (anchorDay % providers.length) + providers.length) %
    providers.length
  const now = new Date((anchorDay + startOffset) * DAY_MS)
  // The production call consumes one row, and the replay then needs several left to over-delete.
  await write(
    `/* explainAnalyzeRun */ INSERT INTO facebook_accounts (facebook_user_id, facebook_user_data, user_id, unlinked_at)
     SELECT $1 || g, '{}'::jsonb, NULL, $2::timestamptz + g * interval '1 minute'
     FROM generate_series(1, 5) g`,
    [ORPHAN_KEY_PREFIX, new Date(now.getTime() - 400 * DAY_MS)],
  )
  try {
    await runAndCapture(
      'orphaned-oauth-account-batch-pick-once',
      () => cleanupOrphanedOAuthAccounts({ batchSize: 1, maxBatches: 1, retentionDays: 90, now }),
      undefined,
      'deleteOrphanedOAuthAccountBatch',
      { localSettings: FORCE_RESCAN_SETTINGS },
    )
  } finally {
    await write(
      `/* explainAnalyzeRun */ DELETE FROM facebook_accounts WHERE facebook_user_id LIKE $1`,
      [`${ORPHAN_KEY_PREFIX}%`],
    )
  }
}
