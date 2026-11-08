import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { cleanupRetainedIdentityRoots } from '@services/data-retention/cleanup-retained-identities'
import { COMMUNITY_AGENT_PROMPT_CREATOR_COUNT } from '../community-agent-prompt-page-ids.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'
import { COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS } from '../seed-data/community-agent-prompt-slot-counts.mts'

// A retained actor may have an FK in any history month; its ID cannot prune an event-ID partition.
const HISTORICAL_USER_REFERENCE_PARENTS = [
  'copyright_notice_lifecycle_changes',
  'copyright_territorial_decisions',
  'copyright_territorial_redress_decisions',
  'copyright_notice_submission_assessments',
  'copyright_notice_email_intake_reviews',
  'copyright_notice_email_correspondence_reviews',
  'copyright_restriction_administrator_lifts',
  'copyright_repeat_infringer_dispositions',
  'copyright_repeat_infringer_reviews',
  'post_clearance_changes',
  'community_post_review_changes',
] as const

/** Captures the real root DELETE, including the new retained slot-count reference probe. */
export async function runSlotRetainedRootCleanupScenario(): Promise<void> {
  const orphanId = seedUuidAtTimestamp(Date.parse('2005-09-15T05:30:00Z'), 0)
  const restoreOrphan = async (): Promise<void> => {
    await write(sql`/* seedPromptSlotRetainedUserOrphan */
      INSERT INTO retained_user_identities (id) VALUES (${orphanId}::uuid)
      ON CONFLICT DO NOTHING`)
  }
  await restoreOrphan()
  try {
    registerScenarioContract('community-agent-prompt-slot-retained-root-cleanup', {
      allowEmptyResult: true,
      seededRows: {
        retained_user_identities: 20_001,
        community_agent_prompt_slot_counts:
          COMMUNITY_AGENT_PROMPT_CREATOR_COUNT +
          COMMUNITY_AGENT_PROMPT_SLOT_COUNT_NOISE_CREATORS +
          2,
      },
      expectations: [
        { kind: 'usesIndexes', indexes: ['community_agent_prompt_slot_counts_pkey'] },
        { kind: 'maxProcessedRows', relation: 'community_agent_prompt_slot_counts', max: 1 },
        { kind: 'maxProcessedRows', relation: 'retained_user_identities', max: 3 },
      ],
      crossPartition: Object.fromEntries(
        HISTORICAL_USER_REFERENCE_PARENTS.map(parent => [
          parent,
          'A retained user may be referenced by a historical actor FK in any event-ID partition; this one-user cleanup probes each leaf through its actor index.',
        ]),
      ),
      forbidSequentialScans: ['community_agent_prompt_slot_counts', 'retained_user_identities'],
    })
    await runAndCapture(
      'community-agent-prompt-slot-retained-root-cleanup',
      async () => {
        const [page] = await cleanupRetainedIdentityRoots(1, { user: [orphanId] })
        assert.equal(page?.scanned, 1)
        assert.equal(page?.deleted, 1)
      },
      undefined,
      'deleteUnreferencedRetainedIdentityPage',
      { afterCapture: restoreOrphan },
    )
  } finally {
    await write(sql`/* cleanupPromptSlotRetainedUserOrphan */
      DELETE FROM retained_user_identities WHERE id = ${orphanId}::uuid`)
  }
}
