import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('retired agent viewer routes', () => {
  it.each([
    '/api/v1/agents',
    '/api/v1/agents/helper',
    '/api/v1/agents/helper/conversations',
    '/api/v1/agents/helper/conversations/00000000-0000-7000-8000-000000000001',
    '/api/v1/posts/post/agents/agent/responses',
  ])('does not mount %s', async path => {
    const request = createRequest()
    await request.get(path).expect(404)
  })
})
