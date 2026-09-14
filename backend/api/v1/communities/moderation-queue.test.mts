import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'
import { insertReportJudgement } from '@services/moderation-reports/judgements'
import type { PrivateUser } from '@services/users/types'
import crypto from 'node:crypto'

describe('GET /api/v1/communities/:idOrSlug/moderation-queue', () => {
  let author: PrivateUser
  let reporter: PrivateUser
  let moderatorUser: PrivateUser
  let regularUser: PrivateUser
  let siteAdmin: PrivateUser

  beforeAll(async () => {
    ;[author, reporter, regularUser, siteAdmin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])

    moderatorUser = await createTestUser()
    await addUserRole(moderatorUser.id, 'moderator')
    // Refresh private user with updated roles
    const { getPrivateUserByAny } = await import('@services/users/get')
    moderatorUser = (await getPrivateUserByAny(moderatorUser.id))!
  })

  it('returns 401 for unauthenticated requests', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Community 401 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-401-${crypto.randomUUID().slice(0, 8)}`,
    })
    const request = createRequest()
    await request.get(`/api/v1/communities/${community.slug}/moderation-queue`).expect(401)
  })

  it('returns 403 for a signed-in user who is not a member and not staff', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Community 403 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-403-${crypto.randomUUID().slice(0, 8)}`,
    })
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/communities/${community.slug}/moderation-queue`).expect(403)
  })

  it('returns 200 for a community member with redacted viewer_tier=member', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Community Member ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-member-${crypto.randomUUID().slice(0, 8)}`,
    })
    const memberUser = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: memberUser.id })

    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-member-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue Member Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      note: 'Reporter note for site staff only.',
    })
    await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      rerunById: null,
      recommendedAction: 'warn',
      publicResponse: 'Public judgement from report context.',
      internalResponse: 'Internal judgement from reporter note.',
      model: 'test-model',
    })

    const request = createRequest()
    await request.authenticateAs(memberUser)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(response.body.viewer_tier).toBe('member')
    expect(Array.isArray(response.body.entries)).toBe(true)
    // Member tier should not see reporter identity fields
    for (const entry of response.body.entries) {
      expect(entry).not.toHaveProperty('reporter_user_id')
      expect(entry).not.toHaveProperty('reporter_username')
      expect(entry).not.toHaveProperty('note')
      expect(entry).not.toHaveProperty('resolved_by_id')
    }
  })

  it('returns 200 with viewer_tier=moderator for a community moderator', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Community Mod ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-mod-${crypto.randomUUID().slice(0, 8)}`,
    })
    const communityMod = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: communityMod.id,
      role: 'moderator',
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-mod-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue Mod Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      note: 'Reporter note visible to site staff.',
    })
    await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      rerunById: null,
      recommendedAction: 'remove',
      publicResponse: 'Staff public judgement.',
      internalResponse: 'Staff internal judgement.',
      model: 'test-model',
    })

    const request = createRequest()
    await request.authenticateAs(communityMod)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(response.body.viewer_tier).toBe('moderator')
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
    // Community moderators (non-site-staff) review reports without reporter identity.
    const modEntry = (response.body.entries as Array<Record<string, unknown>>).find(
      e => e.entity_id === postId,
    )
    expect(modEntry).toBeDefined()
    expect(modEntry).not.toHaveProperty('reporter_user_id')
    expect(modEntry).not.toHaveProperty('reporter_username')
    expect(modEntry).not.toHaveProperty('note')
    expect(modEntry?.judgement).toBeNull()
  })

  it('returns 200 for site staff even without community membership', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Community Staff ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-staff-${crypto.randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-staff-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue Staff Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      note: 'Reporter note visible to site staff.',
    })
    await insertReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      rerunById: null,
      recommendedAction: 'remove',
      publicResponse: 'Staff public judgement.',
      internalResponse: 'Staff internal judgement.',
      model: 'test-model',
    })

    const request = createRequest()
    await request.authenticateAs(siteAdmin)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(response.body.viewer_tier).toBe('moderator')
    // Site staff DO see reporter identity (unlike community moderators).
    const staffEntry = (response.body.entries as Array<Record<string, unknown>>).find(
      e => e.entity_id === postId,
    )
    expect(staffEntry?.reporter_user_id).toBe(reporter.id)
    expect(staffEntry?.note).toBe('Reporter note visible to site staff.')
    expect((staffEntry?.judgement as Record<string, unknown>)?.internal_response).toBe(
      'Staff internal judgement.',
    )
  })

  it('resolves community by UUID as well as slug', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Community UUID ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-uuid-${crypto.randomUUID().slice(0, 8)}`,
    })

    const request = createRequest()
    await request.authenticateAs(siteAdmin)
    const bySlug = await request
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)
    const byId = await request
      .get(`/api/v1/communities/${community.id}/moderation-queue`)
      .expect(200)

    expect(bySlug.body.viewer_tier).toBe(byId.body.viewer_tier)
  })

  it('returns page_info with end_cursor when has_next_page is true', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Cursor Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-cursor-${crypto.randomUUID().slice(0, 8)}`,
    })

    // Seed 3 reports
    for (let i = 0; i < 3; i++) {
      const pid = await insertTestPost({
        createdById: author.id,
        slug: `mod-queue-cursor-rp-${i}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Mod Queue Cursor RP ${i} ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
        communityId: community.id,
      })
      const r = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: r.id,
        entityType: 'post',
        entityId: pid,
        reason: 'spam',
      })
    }

    const request = createRequest()
    await request.authenticateAs(siteAdmin)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-queue?limit=2`)
      .expect(200)

    expect(response.body.page_info.has_next_page).toBe(true)
    expect(typeof response.body.page_info.end_cursor).toBe('string')
  })

  it('site moderator (not admin) also gets full moderator view', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Route Moderator Role ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-route-modrole-${crypto.randomUUID().slice(0, 8)}`,
    })

    const request = createRequest()
    await request.authenticateAs(moderatorUser)
    const response = await request
      .get(`/api/v1/communities/${community.slug}/moderation-queue`)
      .expect(200)

    expect(response.body.viewer_tier).toBe('moderator')
  })
})
