import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { searchCommunityModerationQueue } from './moderation-queue.mts'
import { insertReportJudgement } from '@services/moderation-reports/judgements'
import crypto from 'node:crypto'

describe('searchCommunityModerationQueue judgement attachment', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('attaches full judgement including internal_response when a judgement exists', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `MQ Judgement ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mq-judgement-${crypto.randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mq-judgement-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `MQ Judgement Post ${crypto.randomUUID().slice(0, 8)}`,
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
      recommendedAction: 'escalate',
      publicResponse: 'Escalated for review.',
      internalResponse: 'Needs human decision.',
      model: 'test-model',
    })

    const result = await searchCommunityModerationQueue(community.id, { limit: 50 })
    const entry = result.entries.find(e => e.entity_id === postId)
    expect(entry).toBeDefined()
    expect(entry!.judgement).not.toBeNull()
    expect(entry!.judgement!.recommended_action).toBe('escalate')
    expect(entry!.judgement!.public_response).toBe('Escalated for review.')
    expect(entry!.judgement!.internal_response).toBe('Needs human decision.')
    expect(entry!.judgement!.is_stale).toBe(false)
    expect(entry!.judgement!.judged_report_count).toBe(1)
    expect(entry!.judgement!.current_report_count).toBe(1)
  })

  it('sets judgement to null for entries with no judgement', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `MQ No Judgement ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mq-no-judgement-${crypto.randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mq-no-judgement-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `MQ No Judgement Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
    })

    const result = await searchCommunityModerationQueue(community.id, { limit: 50 })
    const entry = result.entries.find(e => e.entity_id === postId)
    expect(entry).toBeDefined()
    expect(entry!.judgement).toBeNull()
  })
})
