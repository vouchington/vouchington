import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import {
  acquirePostModerationLedgerRetentionTestLock,
  beginTransaction,
  createTestUser,
  insertTestPost,
  insertTestPostModerationVersionAt,
} from '@voucha/test-helpers'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import {
  getTestPostModerationPolicyRevisionCursor,
  getTestPostModerationVersionMarkers,
  setTestPostModerationPolicyRevisionCursor,
  setTestPostModerationRetentionHash,
} from '@voucha/test-helpers/post-moderation-retention-progress'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import { processPostModerationCandidatePage } from './cleanup-post-moderation-ledger-candidates.mts'
import { cleanupPostModerationLedger } from './cleanup-post-moderation-ledger.mts'
import { reconsiderChangedPostModerationPostById } from './cleanup-post-moderation-ledger-hash-work.mts'
import {
  reconsiderPostModerationPolicyRevision,
  reconsiderPostModerationPolicyRevisionPage,
} from './cleanup-post-moderation-ledger-policy.mts'

const NEXT_REVISION = 'test-policy-revision-after-bump'
const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

describe('post moderation retention policy revisions', () => {
  it('runs one bounded revision pass and wakes a dormant old-policy version with an aged successor', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const postId = await insertTestPost({
      createdById: user.id,
      slug: `policy-retention-${randomUUID()}`,
      title: 'Policy retention',
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    const oldHash = randomBytes(32)
    const newHash = randomBytes(32)
    const oldId = uuidv7({ msecs: at(95).getTime() })
    const successorId = uuidv7({ msecs: at(91).getTime() })
    await setTestPostModerationRetentionHash(postId, oldHash)
    await insertTestPostModerationVersionAt({
      id: oldId,
      postId,
      contentSha256: oldHash,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    await insertTestPostModerationVersionAt({
      id: successorId,
      postId,
      contentSha256: newHash,
      policyRevision: POST_MODERATION_POLICY_REVISION,
    })
    await cleanupPostModerationLedger({
      now,
      lowerBoundDate,
      retentionDays: 90,
      batchSize: 2,
      maxBatches: 1,
      kinds: ['superseded_versions'],
    })
    expect(await getTestPostModerationVersionMarkers(oldId)).toMatchObject({ dueAt: null })

    // The alternate code revision is exercised only inside this owned transaction.
    // Rollback restores the shared singleton and source rows for parallel test forks.
    await using query = await beginTransaction()
    const lowerId = uuidv7({ msecs: at(96).getTime() })
    const page = await reconsiderPostModerationPolicyRevisionPage(query, 1, lowerId)
    expect(page.processed).toBe(true)
    await reconsiderChangedPostModerationPostById(query, postId, 2, NEXT_REVISION)
    const markers = await getTestPostModerationVersionMarkers(oldId, query)
    expect(markers?.dueAt).toEqual(at(91))
    const changed = await processPostModerationCandidatePage(
      query,
      'superseded_versions',
      [{ id: oldId, version_id: oldId, retention_due_at: markers!.dueAt! }],
      uuidv7({ msecs: at(90).getTime() }),
      NEXT_REVISION,
    )
    expect(changed.changed).toBe(1)
    expect(await getTestPostModerationVersionMarkers(oldId, query)).toBeNull()
    await setTestPostModerationPolicyRevisionCursor(
      POST_MODERATION_POLICY_REVISION,
      ZERO_UUID,
      query,
    )
    await reconsiderPostModerationPolicyRevision(query, 1, NEXT_REVISION)
    expect((await getTestPostModerationPolicyRevisionCursor(query))?.observedRevision).toBe(
      NEXT_REVISION,
    )
    // Disposal rolls back this simulated code revision and its temporary delete.
  })
})
