import { it, expect, describe } from 'vitest'
import { buildPostSearchQuery } from '../query-builder.mts'

describe('query-builder (profile counts)', () => {
  it('inlines one profile post type so the type index predicate is visible', () => {
    const authorId = '00000000-0000-7000-8000-000000000001'
    const query = buildPostSearchQuery(undefined, {
      user_id: authorId,
      profileCountPostType: 'comment',
      omitLimit: true,
      omitOrderBy: true,
    })

    expect(query.sql).toContain("posts.post_type = 'comment'")
    expect(query.sql).toContain('posts.deleted_at IS NULL')
    expect(query.sql).toContain('posts.is_anonymous = false')
    expect(query.sql).not.toContain('post_type = ANY')
    expect(query.sql).not.toContain('posts.is_anonymous IS NOT TRUE')
    expect(query.sql).not.toContain("posts.post_type != 'comment'")

    const self = buildPostSearchQuery(
      {
        __entity_type: 'user',
        id: authorId,
        username: 'author',
        roles: [],
        account_type: 'official',
      },
      {
        user_id: authorId,
        profileCountPostType: 'review',
        omitLimit: true,
        omitOrderBy: true,
      },
    )
    expect(self.sql).toContain("posts.post_type = 'review'")
    expect(self.sql).not.toContain('posts.is_anonymous = false')
  })
})
