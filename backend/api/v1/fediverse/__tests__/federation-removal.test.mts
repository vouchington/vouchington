import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'

// Phase C6: this guardrail's job flipped from "assert every AP-shaped path stays absent"
// (pre-Phase-C) to "assert the specific dead surfaces from the old, removed federation server stay
// dead, while the real Phase C routes serve." Same 8 paths as before this swap, re-partitioned by
// what actually changed. Deep per-route behavior (success/error bodies, signature verification,
// etc.) is covered by webfinger.test.mts, nodeinfo.test.mts, actor.test.mts, and inbox.test.mts —
// this file only guards route *existence*, not behavior.
describe('surfaces removed with the old federation server stay absent', () => {
  it.each([
    '/api/v1/activitypub/inbox',
    '/api/v1/activitypub/outbox',
    '/api/v1/mastodon/statuses', // Mastodon-compatible local REST API: never built, not part of Phase C
    '/ap/users/test/inbox', // the real inbox is the single shared POST /ap/inbox, never per-actor
    '/ap/users/test/outbox', // outbound delivery is push-based (Phase C4); no queryable outbox exists
  ])('does not mount %s', async path => {
    const request = createRequest()
    await request.get(path).expect(404)
  })
})

describe('Phase C ActivityPub discovery surfaces now serve', () => {
  it('mounts GET /.well-known/webfinger', async () => {
    const request = createRequest()
    // A bare request with no `resource` query is a 400 (bad request, route present), never a 404
    // (route absent) — that distinction is exactly what this guardrail exists to prove.
    await request.get('/.well-known/webfinger').expect(400)
  })

  it('mounts GET /.well-known/nodeinfo', async () => {
    const request = createRequest()
    const response = await request.get('/.well-known/nodeinfo').expect(200)
    expect(response.body.links).toBeDefined()
  })

  it('mounts GET /nodeinfo/2.0', async () => {
    const request = createRequest()
    const response = await request.get('/nodeinfo/2.0').expect(200)
    expect(response.body.protocols).toEqual(['activitypub'])
  })
})
