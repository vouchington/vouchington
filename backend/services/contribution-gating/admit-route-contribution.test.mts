import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseIdempotencyKeyHeader } from './admit-route-contribution.mts'
import { resolveAdmissionIdentity } from './admission.mts'

const routes = [
  [
    'posts',
    '../../api/v1/posts/posts-routes/posts-create-post.mts',
    'contributionPolicySourceForPostType',
  ],
  [
    'community posts',
    '../../api/v1/communities/posts-create.mts',
    'contributionPolicySourceForPostType',
  ],
  [
    'topic recommendations',
    '../../api/v1/topic-recommendations/index-routes/topic-recommendations-post.mts',
    'topic_recommendation',
  ],
  ['RSS discussions', '../../api/v1/rss-feed-items/discussion.mts', 'rss_item_discussion'],
  ['story discussions', '../../api/v1/stories/discussion.mts', "source: 'story'"],
] as const

describe('route contribution admission contract', () => {
  it('accepts one UUID header, rejects malformed/multiple values, and generates compatibility identities', () => {
    const key = randomUUID()
    expect(parseIdempotencyKeyHeader(key)).toBe(key)
    expect(parseIdempotencyKeyHeader(undefined)).toBeNull()
    expect(() => parseIdempotencyKeyHeader([key, randomUUID()])).toThrow('single UUID')
    expect(() => resolveAdmissionIdentity('not-a-uuid')).toThrow('must be a UUID')
    expect(resolveAdmissionIdentity(null).callerSupplied).toBe(false)
    expect(resolveAdmissionIdentity(null).callerCanReplay).toBe(false)
    expect(resolveAdmissionIdentity(key).idempotencyKey).toBe(key)
    expect(resolveAdmissionIdentity(key).callerSupplied).toBe(true)
    expect(resolveAdmissionIdentity(key).callerCanReplay).toBe(true)
  })

  it.each(routes)(
    '%s enters admission after its guards and registers prepared finalization',
    async (_name, file, source) => {
      const route = await readFile(new URL(file, import.meta.url), 'utf8')
      expect(route).toContain('admitRouteContribution')
      expect(route).toContain("ctx.req.headers['idempotency-key']")
      expect(route).toContain(source)
      expect(route).toContain('executePreparedContribution')
      expect(route.lastIndexOf('admitRouteContribution')).toBeGreaterThan(
        route.indexOf('assertCanContribute'),
      )
    },
  )

  it('keeps topic recommendations behind the contribution age gate before admission', async () => {
    const route = await readFile(
      new URL(
        '../../api/v1/topic-recommendations/index-routes/topic-recommendations-post.mts',
        import.meta.url,
      ),
      'utf8',
    )
    expect(route.indexOf('await assertCanContribute')).toBeLessThan(
      route.lastIndexOf('admitRouteContribution'),
    )
  })
})
