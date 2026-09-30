import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

// The list reads its filters leniently (unreadable limits and unknown statuses settle to defaults),
// so the generated query contract only rejects what the settled values still get wrong.
describe('GET /api/v1/appeals query contract', () => {
  let staff: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[staff, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('answers 401 before reading the query', async () => {
    const response = await createRequest().get('/api/v1/appeals?limit=1.5')

    expect(response.status).toBe(401)
    expect(response.text).not.toMatch(/schema|must be|invalid/i)
  })

  it.each(['limit=1.5', 'limit=2.25&status=dismissed'])(
    'answers 422 for a fractional limit (%s), which used to reach SQL and answer 500',
    async query => {
      for (const user of [staff, member]) {
        const request = createRequest()
        await request.authenticateAs(user)
        await request.get(`/api/v1/appeals?${query}`).expect(422)
      }
    },
  )

  it.each([
    'limit=500',
    'limit=abc',
    'limit=0',
    'limit=-3',
    'status=nope',
    'status=a&status=b',
    'mine=nope',
    'unknown=1',
  ])('keeps the lenient fallback for %s', async query => {
    const request = createRequest()
    await request.authenticateAs(staff)

    const response = await request.get(`/api/v1/appeals?${query}`).expect(200)
    expect(response.body.appeals.length).toBeLessThanOrEqual(100)
  })

  it('keeps the cursor 400 and the member scope', async () => {
    const request = createRequest()
    await request.authenticateAs(member)

    await request.get('/api/v1/appeals?after=not-a-cursor').expect(400)
    await request.get('/api/v1/appeals?mine=true&limit=1').expect(200)
  })
})
