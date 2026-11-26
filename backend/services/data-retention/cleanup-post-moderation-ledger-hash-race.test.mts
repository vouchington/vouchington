import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import {
  acquirePostModerationLedgerRetentionTestLock,
  beginTransaction,
  createTestUser,
  insertTestPost,
  insertTestPostModerationVersionAt,
} from '@voucha/test-helpers'
import {
  holdTestRetentionPostHash,
  runTestRetentionWithCommitAtWait,
} from '@voucha/test-helpers/moderation-retention-race'
import {
  getTestPostModerationPostWork,
  getTestPostModerationVersionMarkers,
  setTestPostModerationRetentionHash,
} from '@voucha/test-helpers/post-moderation-retention-progress'
import { createIsolatedRetentionWindow } from '@voucha/test-helpers/retention-window'
import { POST_MODERATION_POLICY_REVISION as revision } from '@services/post-clearance/moderation-ledger-types'
import { reconsiderChangedPostModerationPost } from './cleanup-post-moderation-ledger-hash-work.mts'
import { cleanupPostModerationLedger } from './cleanup-post-moderation-ledger.mts'

describe('post moderation dirty-hash retention', () => {
  it('wakes a dormant version using the concurrent post hash change', async () => {
    const lock = await acquirePostModerationLedgerRetentionTestLock()
    onTestFinished(() => lock.release())
    const { now, at, lowerBoundDate } = createIsolatedRetentionWindow()
    const user = await createTestUser()
    const postId = await insertTestPost({
      createdById: user.id,
      title: 'Moderation hash retention race',
      slug: `moderation-hash-retention-${randomUUID()}`,
      markdown: 'body',
      clearanceStatus: 'pending',
    })
    const oldHash = randomBytes(32)
    const successorHash = randomBytes(32)
    const oldId = v7({ msecs: at(95).getTime() })
    const successorId = v7({ msecs: at(91).getTime() })
    await setTestPostModerationRetentionHash(postId, oldHash)
    await insertTestPostModerationVersionAt({
      id: oldId,
      postId,
      contentSha256: oldHash,
      policyRevision: revision,
    })
    await insertTestPostModerationVersionAt({
      id: successorId,
      postId,
      contentSha256: successorHash,
      policyRevision: revision,
    })
    await cleanupPostModerationLedger({
      now,
      lowerBoundDate,
      retentionDays: 90,
      batchSize: 2,
      maxBatches: 1,
      kinds: ['superseded_versions'],
    })
    expect(await getTestPostModerationVersionMarkers(oldId)).toMatchObject({
      dueAt: null,
      hashBlockedAt: expect.any(Date),
    })

    await using holder = await beginTransaction()
    await holdTestRetentionPostHash(postId, holder)
    await runTestRetentionWithCommitAtWait({
      holder,
      marker: '/* lockChangedPostModerationRetentionPost */',
      binding: postId,
      beforeCommit: () => setTestPostModerationRetentionHash(postId, successorHash, holder),
      run: query => reconsiderChangedPostModerationPost(query, 2, revision, [postId]),
    })
    expect((await getTestPostModerationVersionMarkers(oldId))?.dueAt).toEqual(at(91))
    expect(await getTestPostModerationPostWork(postId)).toBeNull()
  })
})
