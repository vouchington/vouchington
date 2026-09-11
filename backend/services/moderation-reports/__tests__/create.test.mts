import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestLocalFollow, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createModerationReport } from '../create.mts'
import { parseCreateModerationReportInput } from '../parse.mts'
import { currentUserCanReportVisiblePost } from '../reportable-post-access.mts'

describe('createModerationReport', () => {
  let reporter: PrivateUser
  let otherUser: PrivateUser
  let postId: string

  beforeAll(async () => {
    reporter = await createTestUser()
    otherUser = await createTestUser()
    postId = await createReportPost(otherUser.id, 'test-post')
  })

  it('creates a new report and returns isDuplicate false', async () => {
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      note: null,
    })
    const { report, isDuplicate } = await createModerationReport(reporter.id, input)

    expect(isDuplicate).toBe(false)
    expect(report.reporter_user_id).toBe(reporter.id)
    expect(report.entity_type).toBe('post')
    expect(report.entity_id).toBe(postId)
    expect(report.reason).toBe('spam')
    expect(report.note).toBeNull()
    expect(report.status).toBe('pending')
  })

  it('returns isDuplicate true on second report for same entity', async () => {
    const freshPostId = await createReportPost(otherUser.id, 'dup-post')
    const freshReporter = await createTestUser()
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId: freshPostId,
      reason: 'harassment',
      note: 'First note',
    })

    const first = await createModerationReport(freshReporter.id, input)
    expect(first.isDuplicate).toBe(false)

    const second = await createModerationReport(
      freshReporter.id,
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: freshPostId,
        reason: 'spam',
        note: 'Updated note',
      }),
    )
    expect(second.isDuplicate).toBe(true)
    expect(second.report.id).toBe(first.report.id)
    expect(second.report.reason).toBe('spam')
    expect(second.report.note).toBe('Updated note')
  })

  it('rejects self-reporting a user', async () => {
    const input = parseCreateModerationReportInput({
      entityType: 'user',
      entityId: reporter.id,
      reason: 'spam',
      note: null,
    })
    await expect(createModerationReport(reporter.id, input)).rejects.toThrow(
      /Cannot report yourself/,
    )
  })

  it('stores a note when provided', async () => {
    const notePostId = await createReportPost(otherUser.id, 'note-post')
    const noteReporter = await createTestUser()
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId: notePostId,
      reason: 'other',
      note: 'This is a test note',
    })
    const { report } = await createModerationReport(noteReporter.id, input)
    expect(report.note).toBe('This is a test note')
  })

  it('creates a report for a comment entity type', async () => {
    const rootPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `report-comment-root-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Comment Root ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Root post body',
    })
    const commentId = await insertTestPost({
      createdById: otherUser.id,
      slug: `report-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: `Report Comment ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const input = parseCreateModerationReportInput({
      entityType: 'comment',
      entityId: commentId,
      reason: 'harassment',
      note: null,
    })
    const { report, isDuplicate } = await createModerationReport(reporter.id, input)

    expect(isDuplicate).toBe(false)
    expect(report.entity_type).toBe('comment')
    expect(report.entity_id).toBe(commentId)
    expect(report.status).toBe('pending')
  })

  it('rejects reports for posts the reporter cannot view', async () => {
    const hiddenPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `hidden-report-target-${crypto.randomUUID().slice(0, 8)}`,
      title: `Hidden Report Target ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Hidden post body',
      privacy: 'private',
      broadcast: 'followers',
    })
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId: hiddenPostId,
      reason: 'spam',
      note: null,
    })

    await expect(createModerationReport(reporter.id, input)).rejects.toThrow(
      /Reportable entity not found/,
    )
  })

  it('rejects workflow-only post types as generic report targets', async () => {
    const recommendationPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `blocked-report-target-${crypto.randomUUID().slice(0, 8)}`,
      title: `Blocked Report Target ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Recommendation body',
      postType: 'topic_recommendation',
    })
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId: recommendationPostId,
      reason: 'spam',
      note: null,
    })

    await expect(createModerationReport(reporter.id, input)).rejects.toThrow(
      /Reportable entity not found/,
    )
  })

  it('rejects comments under workflow-only post roots', async () => {
    const recommendationPostId = await insertTestPost({
      createdById: otherUser.id,
      slug: `blocked-comment-root-${crypto.randomUUID().slice(0, 8)}`,
      title: `Blocked Comment Root ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Recommendation body',
      postType: 'topic_recommendation',
    })
    const commentId = await insertTestPost({
      createdById: otherUser.id,
      slug: `blocked-root-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: `Blocked Root Comment ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Comment body',
      postType: 'comment',
      rootId: recommendationPostId,
      parentId: recommendationPostId,
    })
    const input = parseCreateModerationReportInput({
      entityType: 'comment',
      entityId: commentId,
      reason: 'spam',
      note: null,
    })

    await expect(createModerationReport(reporter.id, input)).rejects.toThrow(
      /Reportable entity not found/,
    )
  })

  it('rejects community-scoped report targets without community visibility', async () => {
    await expect(
      currentUserCanReportVisiblePost(reporter, {
        id: crypto.randomUUID(),
        created_by_id: otherUser.id,
        broadcast: 'everyone',
        privacy: 'public',
        clearance_status: 'approved',
        community_id: crypto.randomUUID(),
      }),
    ).resolves.toBe(false)
  })

  it('allows creators to report-visible pending posts they can view', async () => {
    await expect(
      currentUserCanReportVisiblePost(reporter, {
        id: crypto.randomUUID(),
        created_by_id: reporter.id,
        broadcast: 'everyone',
        privacy: 'public',
        clearance_status: 'pending',
      }),
    ).resolves.toBe(true)
  })

  it('allows mutual followers to report private mutual-follower posts', async () => {
    const mutualCreator = await createTestUser()
    await insertTestLocalFollow(reporter.id, mutualCreator.id)
    await insertTestLocalFollow(mutualCreator.id, reporter.id)

    await expect(
      currentUserCanReportVisiblePost(reporter, {
        id: crypto.randomUUID(),
        created_by_id: mutualCreator.id,
        broadcast: 'mutual_followers',
        privacy: 'private',
        clearance_status: 'approved',
      }),
    ).resolves.toBe(true)
  })

  it('creates a report for illegal_content reason and triggers critical-severity N2 alert', async () => {
    const illegalPostId = await createReportPost(otherUser.id, 'illegal')
    const input = parseCreateModerationReportInput({
      entityType: 'post',
      entityId: illegalPostId,
      reason: 'illegal_content',
      note: null,
    })
    const { report, isDuplicate } = await createModerationReport(reporter.id, input)

    expect(isDuplicate).toBe(false)
    expect(report.reason).toBe('illegal_content')
    expect(report.status).toBe('pending')
  })

  it('rejects raw notes longer than the stored limit', () => {
    expect(() =>
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: crypto.randomUUID(),
        reason: 'other',
        note: `${' '.repeat(1000)}x`,
      }),
    ).toThrow('Note must be 1000 characters or fewer')
  })

  it('rejects non-string notes with the existing validation message', () => {
    expect(() =>
      parseCreateModerationReportInput({
        entityType: 'post',
        entityId: crypto.randomUUID(),
        reason: 'other',
        note: 42,
      }),
    ).toThrow('Invalid note')
  })

  it('preserves cross-field validation precedence over note validation', () => {
    expect(() =>
      parseCreateModerationReportInput({
        entityType: 'user',
        entityId: crypto.randomUUID(),
        reason: 'vote_manipulation',
        note: `${' '.repeat(1000)}x`,
      }),
    ).toThrow('vote_manipulation reason is only valid for posts')
  })

  it('does not replace unexpected input-access errors with validation errors', () => {
    const failure = new Error('input access failed')
    const raw = {
      get entityType(): never {
        throw failure
      },
    }

    expect(() => parseCreateModerationReportInput(raw)).toThrow(failure)
  })
})

function createReportPost(createdById: string, label: string): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8)
  return insertTestPost({
    createdById,
    slug: `report-${label}-${suffix}`,
    title: `Report ${label} ${suffix}`,
    markdown: 'Test body',
  })
}
