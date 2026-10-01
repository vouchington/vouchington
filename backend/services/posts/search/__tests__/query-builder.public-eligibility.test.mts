import type { PrivateUser } from '@services/users/types'
import { describe, expect, it } from 'vitest'
import { buildPostSearchQuery } from '../query-builder.mts'

const admin = { id: crypto.randomUUID(), roles: ['administrator'] } as unknown as PrivateUser
const member = { id: crypto.randomUUID(), roles: [] } as unknown as PrivateUser

// A signed-in caller normally widens what they can find: an administrator sees every post and an
// author sees their own uncleared ones. public_eligibility_only judges the caller as signed out.
describe('query-builder public_eligibility_only', () => {
  it('lets an administrator past the public audience rules without the option', () => {
    const { sql } = buildPostSearchQuery(admin, { limit: 10 })

    expect(sql).not.toContain("root_post.privacy = 'public'")
  })

  it.each([admin, member])('judges a signed-in caller like a signed-out reader', user => {
    const { sql } = buildPostSearchQuery(user, { limit: 10, public_eligibility_only: true })

    expect(sql).toContain("root_post.privacy = 'public'")
    expect(sql).toContain("root_post.broadcast = 'everyone'")
    expect(sql).toContain('posts.approved_at IS NOT NULL')
  })

  it('keeps the caller’s mutes, blocks and following rank tied to the caller', () => {
    const { sql, values } = buildPostSearchQuery(admin, {
      limit: 10,
      public_eligibility_only: true,
      exclude_for_user_id: admin.id,
      sort: 'following_new',
    })

    expect(sql).toContain('excluded_users')
    expect(sql).toContain('viewer_following')
    expect(values).toContain(admin.id)
  })

  it('does not widen an author filter to anonymous posts for an administrator', () => {
    const author = crypto.randomUUID()
    const { sql } = buildPostSearchQuery(admin, {
      limit: 10,
      public_eligibility_only: true,
      user_id: author,
    })

    expect(sql).toContain('posts.is_anonymous IS NOT TRUE')
  })

  it('judges the thread of a comment only when comments can be results', () => {
    const base = { limit: 10, public_eligibility_only: true } as const

    expect(buildPostSearchQuery(member, { ...base, post_types: ['comment'] }).sql).toContain(
      'thread_ancestors',
    )
    expect(buildPostSearchQuery(member, { ...base, post_types: ['discussion'] }).sql).not.toContain(
      'thread_ancestors',
    )
    expect(buildPostSearchQuery(member, base).sql).not.toContain('thread_ancestors')
    expect(buildPostSearchQuery(member, { limit: 10, post_types: ['comment'] }).sql).not.toContain(
      'thread_ancestors',
    )
  })
})
