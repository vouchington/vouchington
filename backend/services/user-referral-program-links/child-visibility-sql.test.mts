import { describe, expect, it } from 'vitest'
import { childVisibilitySql } from './child-visibility-sql.mts'

describe('childVisibilitySql', () => {
  it('delegates membership lifecycle eligibility without treating the link as deleted', () => {
    const predicate = childVisibilitySql('link.parent_link_id', 'link.user_id')

    expect(predicate).toContain('view_current_paid_memberships')
    expect(predicate).not.toContain('deleted_at')
  })
})
