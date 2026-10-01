import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type Method = 'post' | 'put' | 'patch' | 'delete'
type Case = [label: string, method: Method, url: string, body: unknown]

const ID = randomUUID()

// Member-facing intake routes: authentication first, then the request contract, then captcha.
const INTAKE: Case[] = [
  ['report without a reason', 'post', '/api/v1/reports', { entityType: 'post', entityId: ID }],
  ['report with an unknown key', 'post', '/api/v1/reports', { entityType: 'post', extra: 1 }],
  ['appeal without a reason', 'post', '/api/v1/appeals', { target_type: 'warning' }],
  [
    'appeal with a bad target id',
    'post',
    '/api/v1/appeals',
    { target_id: 'x', target_type: 'ban' },
  ],
  ['dispute without a claim', 'post', '/api/v1/disputes', { post_id: ID, reason: 'wrong_topic' }],
  ['dispute with a bad post id', 'post', '/api/v1/disputes', { post_id: 'x' }],
  ['batch annotation lookup', 'post', '/api/v1/posts/batch-dispute-annotations', { post_ids: 'x' }],
]

// Staff routes: authentication, then the role gate (403), then the request contract (422).
const STAFF: Case[] = [
  ['appeal draft', 'patch', `/api/v1/appeals/${ID}`, { public_response: 5 }],
  ['appeal resolution', 'post', `/api/v1/appeals/${ID}/resolution`, { action: 'nuke' }],
  ['dispute draft', 'patch', `/api/v1/disputes/${ID}`, { internal_notes: 5 }],
  ['dispute resolution', 'post', `/api/v1/disputes/${ID}/resolution`, {}],
  ['dispute annotation removal', 'delete', `/api/v1/disputes/${ID}/annotation`, {}],
  ['report resolution', 'patch', `/api/v1/reports/${ID}`, { status: 'exploded' }],
]

describe('moderation route request contract ordering', () => {
  let staff: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[staff, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  function send(request: ReturnType<typeof createRequest>, [, method, url, body]: Case) {
    return request[method](url)
      .set('Content-Type', 'application/json')
      .send(body as object)
  }

  it.each([...INTAKE, ...STAFF])(
    '%s: 401 with no schema diagnostic when anonymous',
    async (...c) => {
      const response = await send(createRequest(), c)

      expect(response.status).toBe(401)
      expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
    },
  )

  it.each(INTAKE)('%s: 422 for a signed-in member', async (...c) => {
    const request = createRequest()
    await request.authenticateAs(member)

    await send(request, c).expect(422)
  })

  it.each(STAFF)('%s: 403 for a member, 422 for staff', async (...c) => {
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    await send(memberRequest, c).expect(403)

    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    await send(staffRequest, c).expect(422)
  })

  it('keeps 403 ahead of the UUID check on the staff-only dispute listing', async () => {
    const memberRequest = createRequest()
    await memberRequest.authenticateAs(member)
    await memberRequest.get('/api/v1/posts/not-a-uuid/disputes').expect(403)

    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    await staffRequest.get('/api/v1/posts/not-a-uuid/disputes').expect(422)
  })

  it('keeps the pre-auth media-type gate on report creation', async () => {
    await createRequest()
      .post('/api/v1/reports')
      .set('Content-Type', 'text/plain')
      .send('x')
      .expect(415)
  })

  it('files nothing for a malformed body and files one for the valid body', async () => {
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: member.id,
      slug: `contract-report-${randomUUID().slice(0, 8)}`,
      title: `Contract report ${randomUUID().slice(0, 8)}`,
      markdown: 'Body',
    })
    const request = createRequest()
    await request.authenticateAs(reporter)
    const report = (body: object): Case => ['', 'post', '/api/v1/reports', body]

    await send(request, report({ entityType: 'post', entityId: postId })).expect(422)

    // A duplicate would answer 200: 201 with isDuplicate false proves the 422 wrote nothing.
    const created = await send(
      request,
      report({ entityType: 'post', entityId: postId, reason: 'spam' }),
    ).expect(201)
    expect(created.body.isDuplicate).toBe(false)
  })
})
