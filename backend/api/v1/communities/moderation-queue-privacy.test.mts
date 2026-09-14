import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers'
import { insertReportJudgement } from '@services/moderation-reports/judgements'
import type { PrivateUser } from '@services/users/types'
import crypto from 'node:crypto'

describe('GET /api/v1/communities/:idOrSlug/moderation-queue — member-tier privacy', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('member tier masks target_label/target_path for restricted (followers-only) posts', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Privacy Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-privacy-comm-${crypto.randomUUID().slice(0, 8)}`,
    })
    const memberUser = await createTestUser()
    const communityMod = await createTestUser()
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: memberUser.id }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: communityMod.id,
        role: 'moderator',
      }),
    ])

    // Restricted post: followers-only broadcast
    const restrictedPostId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-restricted-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Restricted Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'restricted body',
      communityId: community.id,
      broadcast: 'followers',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: restrictedPostId,
      reason: 'spam',
    })

    // Public post: everyone broadcast, with an approved community_post_reviews row
    const publicPostId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-public-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Public Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'public body',
      communityId: community.id,
      broadcast: 'everyone',
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId: publicPostId })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: publicPostId,
      reason: 'harassment',
    })

    // --- Member view ---
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(memberUser)
    const memberResponse = await memberRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(memberResponse.body.viewer_tier).toBe('member')
    const memberEntries = memberResponse.body.entries as Array<Record<string, unknown>>

    // Restricted entry: label and path masked, admin_action_path stripped
    const restrictedEntry = memberEntries.find(e => e.entity_id === restrictedPostId)
    expect(restrictedEntry).toBeDefined()
    expect(restrictedEntry!.target_label).toBe('[Private content]')
    expect(restrictedEntry!.target_path).toBeNull()
    expect(restrictedEntry).not.toHaveProperty('admin_action_path')

    // Public entry: NOT masked, admin_action_path also stripped for member tier
    const publicEntry = memberEntries.find(e => e.entity_id === publicPostId)
    expect(publicEntry).toBeDefined()
    expect(publicEntry!.target_label).not.toBe('[Private content]')
    expect(publicEntry!.target_path).not.toBeNull()
    expect(publicEntry).not.toHaveProperty('admin_action_path')

    // --- Moderator view ---
    const modRequest = createRequest()
    await modRequest.authenticateAs(communityMod)
    const modResponse = await modRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(modResponse.body.viewer_tier).toBe('moderator')
    const modEntries = modResponse.body.entries as Array<Record<string, unknown>>

    // Moderator sees the real label/path and admin_action_path for restricted post
    const modRestrictedEntry = modEntries.find(e => e.entity_id === restrictedPostId)
    expect(modRestrictedEntry).toBeDefined()
    expect(modRestrictedEntry!.target_label).not.toBe('[Private content]')
    expect(modRestrictedEntry!.target_path).not.toBeNull()
    expect(modRestrictedEntry).toHaveProperty('admin_action_path')
  })

  it('member tier masks target_label/target_path for pending-review posts (no approved community_post_reviews row)', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Pending Review Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `pending-review-comm-${crypto.randomUUID().slice(0, 8)}`,
    })
    const memberUser = await createTestUser()
    const communityMod = await createTestUser()
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: memberUser.id }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: communityMod.id,
        role: 'moderator',
      }),
    ])

    // Public-broadcast post with NO approved community_post_reviews row (pending review)
    const pendingPostId = await insertTestPost({
      createdById: author.id,
      slug: `pending-review-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Pending Review Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'pending review body',
      communityId: community.id,
      broadcast: 'everyone',
    })
    // Insert a pending (not approved) community_post_review row
    await insertTestPendingCommunityPostReview({ communityId: community.id, postId: pendingPostId })
    // Report the pending post
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: pendingPostId,
      reason: 'spam',
    })

    // --- Member view ---
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(memberUser)
    const memberResponse = await memberRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(memberResponse.body.viewer_tier).toBe('member')
    const memberEntries = memberResponse.body.entries as Array<Record<string, unknown>>

    // Pending-review post: label and path masked for member-tier viewer
    const pendingEntry = memberEntries.find(e => e.entity_id === pendingPostId)
    expect(pendingEntry).toBeDefined()
    expect(pendingEntry!.target_label).toBe('[Private content]')
    expect(pendingEntry!.target_path).toBeNull()

    // --- Moderator view ---
    const modRequest = createRequest()
    await modRequest.authenticateAs(communityMod)
    const modResponse = await modRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(modResponse.body.viewer_tier).toBe('moderator')
    const modEntries = modResponse.body.entries as Array<Record<string, unknown>>

    // Moderator sees the real label/path for pending post
    const modPendingEntry = modEntries.find(e => e.entity_id === pendingPostId)
    expect(modPendingEntry).toBeDefined()
    expect(modPendingEntry!.target_label).not.toBe('[Private content]')
    expect(modPendingEntry!.target_path).not.toBeNull()
  })

  it('exposes the AI judgement to site staff but never to community moderators or members', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Judgement Tier Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `judgement-tier-comm-${crypto.randomUUID().slice(0, 8)}`,
    })
    const memberUser = await createTestUser()
    const communityMod = await createTestUser()
    const siteStaff = await createTestUser({ administrator: true })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: memberUser.id }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: communityMod.id,
        role: 'moderator',
      }),
    ])
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `judgement-tier-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Judgement Tier Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      rerunById: null,
      recommendedAction: 'warn',
      publicResponse: 'Public warning.',
      internalResponse: 'Internal note.',
      model: 'test-model',
    })

    const staffRequest = createRequest()
    await staffRequest.authenticateAs(siteStaff)
    const staffResponse = await staffRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)
    const staffEntry = (staffResponse.body.entries as Array<Record<string, unknown>>).find(
      e => e.entity_id === postId,
    )
    expect((staffEntry?.judgement as Record<string, unknown>)?.internal_response).toBe(
      'Internal note.',
    )

    const modRequest = createRequest()
    await modRequest.authenticateAs(communityMod)
    const modResponse = await modRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)
    const modEntry = (modResponse.body.entries as Array<Record<string, unknown>>).find(
      e => e.entity_id === postId,
    )
    expect(modEntry?.judgement).toBeNull()

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(memberUser)
    const memberResponse = await memberRequest
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)
    const memberEntry = (memberResponse.body.entries as Array<Record<string, unknown>>).find(
      e => e.entity_id === postId,
    )
    expect(memberEntry?.judgement).toBeNull()
  })
})
