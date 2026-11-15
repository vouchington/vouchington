import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { encodeUuidCursorBefore } from '@voucha/test-helpers/modules/pagination/uuid-cursors'
import { decodeUuidCursor, isSimpleCursor } from '@modules/pagination'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { communitiesWorkConfig } from './work-limits.mts'
import { getModerationSummaryRecipients } from './moderation-summary-recipients.mts'

describe('moderation recipient inspected-row cursor', () => {
  it('advances beyond an ineligible user when the page has no recipients', async () => {
    const first = await createTestUserDirect()
    const later = await createTestUserDirect()
    expect(later.id.localeCompare(first.id)).toBeGreaterThan(0)
    const beforeFirst = decodeUuidCursor(
      encodeUuidCursorBefore(first.id),
      isSimpleCursor,
      'Invalid owned user cursor',
    ).id
    const restore = overrideDynamicConfigFieldsForTest(communitiesWorkConfig, {
      summary_email_batch_size: 1,
    })
    try {
      const page = await getModerationSummaryRecipients(
        new Date('2026-11-14T12:00:00.000Z'),
        beforeFirst,
      )
      expect(page).toEqual({ recipients: [], afterId: first.id })
    } finally {
      restore()
    }
  })
})
