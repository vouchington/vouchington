import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser, insertTestPost, safeUsername } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { usersWorkConfig } from '@services/users/work-limits'
import { getUserModerationContext } from '../context.mts'

describe('moderation context content removal cap', () => {
  it('saturates the removed-post count at the configured cap', async () => {
    const staff = await createTestUser({ administrator: true })
    const target = await createTestUser({ username: safeUsername('removal-cap') })
    for (let index = 0; index < 3; index++) {
      const slug = `removal-cap-${randomUUID()}`
      const postId = await insertTestPost({
        title: slug,
        slug,
        createdById: target.id,
        markdown: 'Removed content',
      })
      await write(
        sql`/* removalCapTest:softDelete */ UPDATE posts SET deleted_at = now(), deleted_by_id = ${staff.id} WHERE id = ${postId}`,
      )
    }

    await expect(getUserModerationContext(staff, target, true)).resolves.toMatchObject({
      content_removal_count: 3,
      content_removal_count_capped: false,
    })
    const restore = overrideDynamicConfigFieldsForTest(usersWorkConfig, {
      content_removal_count_cap: 2,
    })
    try {
      await expect(getUserModerationContext(staff, target, true)).resolves.toMatchObject({
        content_removal_count: 2,
        content_removal_count_capped: true,
      })
    } finally {
      restore()
    }
  })
})
