import { afterEach, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { createTestModInternalConversation } from '@voucha/test-helpers/entities/conversation-participant-rows'
import { getConversationNotificationContext } from './get-conversation-notification-context.mts'
import { notificationsWorkConfig } from './work-limits.mts'

describe('configured mod_internal participant read limit', () => {
  let restore: (() => void) | undefined
  afterEach(() => restore?.())

  it('reads no more participants than the configured limit', async () => {
    const owner = await createTestUser()
    const participants = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const postAuthor = await createTestUser()
    const reporter = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postId = await insertTestPost({
      createdById: postAuthor.id,
      slug: `mod-internal-cap-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Cap',
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const { id } = await createTestModInternalConversation({
      communityId: community.id,
      createdById: owner.id,
      moderationReportId: reportId,
      participantUserIds: participants.map(user => user.id),
    })
    restore = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      mod_internal_participant_read_limit: 2,
    })
    const context = await getConversationNotificationContext(id, null)
    expect(context?.participant_user_ids).toHaveLength(2)
  })
})
