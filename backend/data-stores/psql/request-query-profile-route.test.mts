import { describe, expect, it } from 'vitest'
import { createVouchaApiApp } from '../../api/app.mts'
import { resolveRequestProfileRoute } from '../../test-helpers/request-query-profile-route.mts'
import { buildStaleReport } from 'vouchington-tooling/request-query-profile'

describe('request query profile registered routes', () => {
  const app = createVouchaApiApp()
  app.route('/api/v1/my/email-addresses/:email').delete(() => {})
  app.route('/api/v1/topics/:idOrSlug/claims').get(() => {})
  app.route('/api/v1/posts/:idOrSlug').get(() => {})
  app.route('/api/v1/posts/trending').get(() => {})
  app.route('/api/v1/communities/:idOrSlug/modmail').post(() => {})
  app.route('/api/v1/mcp').post(() => {})
  const resolve = (route: string) => resolveRequestProfileRoute(app, route)

  it('uses registered templates for encoded email, slugs, and old UUID-folded paths', () => {
    expect(resolve('DELETE /api/v1/my/email-addresses/tests%2Brandom%40voucha.ai')).toBe(
      'DELETE /api/v1/my/email-addresses/:email',
    )
    expect(resolve('GET /api/v1/topics/:id/claims')).toBe('GET /api/v1/topics/:idOrSlug/claims')
    expect(resolve('GET /api/v1/topics/topic-slug-abc/claims')).toBe(
      'GET /api/v1/topics/:idOrSlug/claims',
    )
    expect(resolve('GET /api/v1/posts/post-archive-api-abc')).toBe('GET /api/v1/posts/:idOrSlug')
    expect(resolve('POST /api/v1/communities/test-community-abc/modmail')).toBe(
      'POST /api/v1/communities/:idOrSlug/modmail',
    )
  })

  it('keeps static precedence, MCP tool identity, and unrelated paths distinct', () => {
    expect(resolve('GET /api/v1/posts/trending')).toBe('GET /api/v1/posts/trending')
    expect(resolve('POST /api/v1/mcp tools/call addListItem')).toBe(
      'POST /api/v1/mcp tools/call addListItem',
    )
    expect(resolve('GET /api/v1/topics/not-a-post')).toBe('GET /api/v1/topics/not-a-post')
    expect(resolve('GET /not-registered?limit=1')).toBe('GET /not-registered?limit=1')
    expect(resolve('GET https://%')).toBe('GET https://%')
    expect(resolve('malformed')).toBe('malformed')
  })

  it('applies the same route resolution to stale evidence without excusing another route', () => {
    const entry = {
      annotation: 'findEmail',
      routes: ['DELETE /api/v1/my/email-addresses/:email'],
      maxCount: 2,
      reason: 'lookup',
      permanent: true as const,
      code: 'backend/services/users/email-addresses.mts:findEmail',
    }
    const line = (route: string) =>
      `[pg-request-profile] route=${route} queries=3 serialDepth=3 repeats=findEmail(x2)`
    const observed = buildStaleReport(
      [entry],
      [line('DELETE /api/v1/my/email-addresses/tests%2Brandom%40voucha.ai')],
      resolve,
    )
    expect(observed.sufficient).toBe(true)
    expect(observed.stale).toEqual([])

    const unrelated = buildStaleReport([entry], [line('DELETE /another-path')], resolve)
    expect(unrelated.stale).toMatchObject([{ fullyStale: true }])
  })
})
