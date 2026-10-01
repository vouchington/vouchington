import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

type Case = [label: string, method: 'get' | 'post', url: string, body: object | null]

const ID = randomUUID()

// Authentication first, then the request contract; a malformed id or body never reaches storage.
const CASES: Case[] = [
  ['upload url without a size', 'post', '/api/v1/images/upload-url', { content_type: 'image/png' }],
  [
    'upload url with a text size',
    'post',
    '/api/v1/images/upload-url',
    { content_type: 'image/png', content_length: '10' },
  ],
  ['upload url with an unknown key', 'post', '/api/v1/images/upload-url', { extra: true }],
  ['completion with a bad id', 'post', '/api/v1/images/not-a-uuid/completions', {}],
  ['upload state with a bad id', 'get', '/api/v1/images/not-a-uuid/upload-state', null],
  ['state stream with a bad id', 'get', '/api/v1/images/not-a-uuid/state/stream', null],
]

describe('image route request contract ordering', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  function send(request: ReturnType<typeof createRequest>, [, method, url, body]: Case) {
    const pending = request[method](url)
    return body === null ? pending : pending.send(body)
  }

  it.each(CASES)('%s: 401 with no schema diagnostic when anonymous', async (...c) => {
    const response = await send(createRequest(), c)

    expect(response.status).toBe(401)
    expect(response.text).not.toMatch(/schema|must be|required|invalid/i)
  })

  it.each(CASES)('%s: 422 for a signed-in user', async (...c) => {
    const request = createRequest()
    await request.authenticateAs(user)

    await send(request, c).expect(422)
  })

  it('still reaches the service for a well-formed id that does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get(`/api/v1/images/${ID}/upload-state`)

    expect(response.status).toBe(404)
  })
})
