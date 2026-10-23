import { describe, expect, it, onTestFinished } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import {
  createTestUser,
  getPostClearanceChanges,
  getTestModerationTransparencyRollupCount,
  hardDeleteTestPost,
  hasTestRetainedIdentityRoot,
  insertTestPost,
  insertTestPostClearanceChange,
} from '@voucha/test-helpers'
import {
  clearTestClearanceIdentityPointer,
  createTestClearanceHistoryRange,
  getTestClearanceProjection,
  projectTestClearanceHistoryChange,
  removeTestClearanceHistoryRange,
} from '@voucha/test-helpers/entities/content-history'
import {
  insertPreservationHoldForTest,
  releasePreservationHoldForTest,
} from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { retireExplicitHistoryRange } from '@data-stores/psql/migration-runner/explicit-range-retirement'
import { setPostClearanceStatus } from '@services/post-clearance/update-status'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'

describe('manual clearance history range retirement', () => {
  it('preserves live clearance, decision identity and rollups while honoring an author hold', async () => {
    const author = await createTestUser()
    const staff = await createTestUser({ administrator: true })
    const occurredAt = new Date(Date.UTC(2023, 5, 1) + Math.floor(Math.random() * 86_400_000))
    const range = await createTestClearanceHistoryRange(occurredAt)
    onTestFinished(() => removeTestClearanceHistoryRange(range.partition))
    const [postId, deletedPostId] = await Promise.all([
      insertTestPost({
        title: `retained-clearance-${crypto.randomUUID()}`,
        slug: `retained-clearance-${crypto.randomUUID()}`,
        markdown: 'history may expire',
        createdById: author.id,
        clearanceStatus: 'pending',
      }),
      insertTestPost({
        title: `deleted-clearance-${crypto.randomUUID()}`,
        slug: `deleted-clearance-${crypto.randomUUID()}`,
        markdown: 'bounded delete',
        createdById: author.id,
        clearanceStatus: 'pending',
      }),
    ])
    const cohort = {
      occurredAt,
      metric: 'automated_moderation' as const,
      category: 'post_clearance_reject' as const,
    }
    const baseline = (await getTestModerationTransparencyRollupCount(cohort)) ?? 0
    const change = await insertTestPostClearanceChange({
      postId,
      status: 'rejected',
      changedById: staff.id,
      occurredAt,
      publicReasonCode: 'staff_rejected',
      privateNote: 'staff-only',
      platformOverride: true,
      moderationTransparencyCategories: ['post_clearance_reject'],
    })
    await projectTestClearanceHistoryChange({ postId, changeId: change.id, changedById: staff.id })
    await insertTestPostClearanceChange({
      postId: deletedPostId,
      status: 'rejected',
      occurredAt: new Date(occurredAt.getTime() + 1_000),
      moderationTransparencyCategories: ['post_clearance_reject'],
    })
    expect(await getTestModerationTransparencyRollupCount(cohort)).toBe(baseline + 2)

    await hardDeleteTestPost(deletedPostId)
    expect(await getTestModerationTransparencyRollupCount(cohort)).toBe(baseline + 1)
    expect(
      await retireExplicitHistoryRange({
        table: 'post_clearance_changes',
        ...range,
        partition: 'post_clearance_changes__default',
      }),
    ).toBe('catalog-mismatch')
    const holdId = await insertPreservationHoldForTest(author.id, staff.id)
    expect(await retireExplicitHistoryRange({ table: 'post_clearance_changes', ...range })).toBe(
      'legal-hold',
    )
    await releasePreservationHoldForTest(holdId, staff.id)
    const actorHoldId = await insertPreservationHoldForTest(staff.id, staff.id)
    expect(await retireExplicitHistoryRange({ table: 'post_clearance_changes', ...range })).toBe(
      'legal-hold',
    )
    await releasePreservationHoldForTest(actorHoldId, staff.id)

    const liveWriterPostId = await insertTestPost({
      title: `live-writer-${crypto.randomUUID()}`,
      slug: `live-writer-${crypto.randomUUID()}`,
      markdown: 'current clearance writer',
      createdById: author.id,
      clearanceStatus: 'pending',
    })
    await using writer = await beginTransaction()
    await setPostClearanceStatus(liveWriterPostId, 'approved', staff.id, { query: writer })
    await expect(
      retireExplicitHistoryRange({ table: 'post_clearance_changes', ...range }),
    ).rejects.toMatchObject({ code: '55P03' })
    await writer.commit()

    expect(
      await retireExplicitHistoryRange({ table: 'post_clearance_changes', ...range }),
    ).toBeNull()
    expect(await getTestModerationTransparencyRollupCount(cohort)).toBe(baseline + 1)
    expect(await getPostClearanceChanges(postId)).toEqual([])
    expect(await getTestClearanceProjection(postId)).toEqual({
      latest_clearance_change_id: change.id,
      clearance_reason: 'staff_rejected',
      clearance_status: 'rejected',
      clearance_private_note: 'staff-only',
      has_creation_moderation_bypass: true,
    })
    expect(await hasTestRetainedIdentityRoot('post_clearance_change', change.id)).toBe(true)
    await cleanupRetainedIdentityRoots(1_000, { post_clearance_change: [change.id] })
    expect(await hasTestRetainedIdentityRoot('post_clearance_change', change.id)).toBe(true)
    await clearTestClearanceIdentityPointer(postId)
    await cleanupRetainedIdentityRoots(1_000, { post_clearance_change: [change.id] })
    expect(await hasTestRetainedIdentityRoot('post_clearance_change', change.id)).toBe(false)
  })
})
