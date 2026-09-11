import { describe, expect, it } from 'vitest'
import { buildNotificationPostRecipientEligibilityFilter } from './post-notification-eligibility.mts'

describe('buildNotificationPostRecipientEligibilityFilter', () => {
  it('combines strict publication state with recipient audience access', () => {
    const userId = '00000000-0000-7000-8000-000000000001'
    const statement = buildNotificationPostRecipientEligibilityFilter(
      'candidate_post',
      'root_post',
      userId,
    )

    expect(statement.text).toContain('candidate_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('root_post.approved_at IS NOT NULL')
    expect(statement.text).toContain('publication_discovery_follow.subject_id')
    expect(statement.text).toContain('publication_member.user_id')
    expect(statement.values).toContain(userId)
  })
})
