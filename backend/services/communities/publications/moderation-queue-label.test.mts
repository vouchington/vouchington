import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import {
  createTestUser,
  deletePostSlugForTest,
  insertTestCommunity,
  insertTestPendingCommunityPostReview,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { searchCommunityModerationQueue } from './moderation-queue.mts'
import { resolveModerationReport } from '@services/moderation-reports/resolve'

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

  it('omits review routes when the post slug is missing', async () => {
    const author = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Slugless ${suffix}`,
      slug: `mod-queue-slugless-${suffix}`,
      post_approval_required_at: new Date(),
    })
    const slug = `mod-queue-slugless-post-${suffix}`
    const postId = await insertTestPost({
      createdById: author.id,
      slug,
      title: 'A slugless queue review',
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId })
    await deletePostSlugForTest(postId, slug)

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      includeModeratorSources: true,
    })
    expect(result.entries.find(row => row.entity_id === postId)).toMatchObject({
      target_label: 'A slugless queue review',
      target_path: null,
      admin_action_path: null,
    })
  })

  it('hydrates reporter and resolver facts for a resolved report', async () => {
    const [author, reporter, resolver] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['staff'] }),
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
    await resolveModerationReport(reportId, {
      trainingEvidence: 'staff_or_user',
      resolvedById: resolver.id,
      status: 'reviewed',
    })

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
