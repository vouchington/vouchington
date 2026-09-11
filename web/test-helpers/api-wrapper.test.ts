import { describe, expect, it, vi } from 'vitest'
import { expectApiWrapperCall } from './api-wrapper'

interface TestResponse {
  item: { id: string }
}

describe('API wrapper test helper', () => {
  it('checks response typing, result forwarding, and API call arguments', async () => {
    const apiGet = vi.fn<(...args: unknown[]) => Promise<TestResponse>>()
    const response: TestResponse = { item: { id: 'item-1' } }

    await expectApiWrapperCall({
      mock: apiGet,
      response,
      call: () => apiGet('/api/v1/items', { searchParams: { q: 'item' } }),
      expectedArgs: ['/api/v1/items', { searchParams: { q: 'item' } }],
    })

    expect(apiGet).toHaveBeenCalledOnce()
  })
})
