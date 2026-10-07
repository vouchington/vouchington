import { describe, expect, it } from 'vitest'
import type { TransactionQuery } from '@data-stores/psql'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import {
  readStaffActionHistory,
  withRejectedStaffActionHistory,
} from '@voucha/test-helpers/staff-action-history'
import { readStaffCategoryState } from '@voucha/test-helpers/staff-editorial-history'
import {
  rejectRssFeedItemCategory,
  unrejectRssFeedItemCategory,
  assignRssFeedItemCategoryToTopic,
} from './unmapped-categories.mts'

describe('rss-feed-items staff history', () => {
  it.each(['reject', 'unreject', 'assign'] as const)(
    'audits RSS %s and rolls it back on history failure',
    async action => {
      const actor = await createTestUser({ administrator: true })
      const topic = await createTestTopic({ user: actor })
      const category = `staff-audit-${crypto.randomUUID()}`
      if (action === 'unreject') await rejectRssFeedItemCategory(actor, category)
      const execute = async (query?: TransactionQuery) => {
        if (action === 'reject') return rejectRssFeedItemCategory(actor, category, { query })
        if (action === 'unreject') return unrejectRssFeedItemCategory(actor, category, { query })
        return assignRssFeedItemCategoryToTopic(
          actor,
          {
            categoryText: category,
            topicId: topic.id,
          },
          { query },
        )
      }
      const before = await readStaffCategoryState(category)
      const history = await readStaffActionHistory(actor.id)
      await expect(withRejectedStaffActionHistory(execute)).rejects.toThrow(
        'staff history rejected',
      )
      expect(await readStaffCategoryState(category)).toEqual(before)
      expect(await readStaffActionHistory(actor.id)).toEqual(history)
      await execute()
      expect((await readStaffActionHistory(actor.id)).at(-1)!.action_type).toBe(
        `rss_category_${action}`,
      )
    },
  )
})
