import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  createTestUser,
  insertTestCommunity,
  insertTestPendingCommunityPostReview,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { searchCommunityModerationQueue } from './moderation-queue.mts'

describe('community review queue label', () => {
  it('uses the post slug for an untitled review', async () => {
    const author = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Untitled ${suffix}`,
      slug: `mod-queue-untitled-${suffix}`,
      post_approval_required_at: new Date(),
    })
    const slug = `mod-queue-untitled-post-${suffix}`
    const postId = await insertTestPost({
      createdById: author.id,
      slug,
      title: '',
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      includeModeratorSources: true,
    })
    const entry = result.entries.find(row => row.entity_id === postId)
    expect(entry?.target_label).toBe(slug)
    expect(entry?.target_label).not.toContain(postId)
  })

  it('hydrates reporter and resolver facts for a resolved report', async () => {
    const [author, reporter, resolver] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Resolved ${suffix}`,
      slug: `mod-queue-resolved-${suffix}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-resolved-post-${suffix}`,
      title: 'Resolved queue post',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    await write(sql`/* resolveQueueLabelTestReport */ UPDATE moderation_reports SET reviewed_at = CURRENT_TIMESTAMP,
      resolution_action = 'reviewed', resolved_by_id = ${resolver.id}
      WHERE id = ${reportId}`)

    const result = await searchCommunityModerationQueue(community.id, {
      status: 'reviewed',
      source: 'report',
      limit: 50,
    })
    expect(result.entries.find(row => row.id === reportId)).toMatchObject({
      reporter_username: reporter.username,
      resolver_username: resolver.username,
      reporter_display_name: null,
      resolver_display_name: null,
    })
  })
})
