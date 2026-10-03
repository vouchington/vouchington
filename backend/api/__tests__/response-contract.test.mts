import { describe, expect, it } from 'vitest'
import { apiOpenApiHttpResponse, apiSseFrame } from '../response-contract.mts'

describe('protocol response contracts', () => {
  it('preserves the opaque Response, unread body and every header', async () => {
    const response = new Response(' {"jsonrpc":"2.0","result":{},"id":1} ', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Transport': 'original' },
    })
    const body = response.body
    const marked = apiOpenApiHttpResponse('POST:/api/v1/mcp', response)
    expect(marked).toBe(response)
    expect(marked.body).toBe(body)
    expect(marked.bodyUsed).toBe(false)
    expect(marked.status).toBe(200)
    expect(marked.headers.get('X-Transport')).toBe('original')
    expect(await marked.text()).toBe(' {"jsonrpc":"2.0","result":{},"id":1} ')
  })

  it('frames Unicode JSON payloads and terminal empty objects exactly', () => {
    expect(
      apiSseFrame('GET:/api/v1/imports/:batchId/stream', {
        event: 'progress',
        data: { message: '雪\nnext' },
      }),
    ).toBe('event: progress\ndata: {"message":"雪\\nnext"}\n\n')
    expect(
      apiSseFrame('GET:/api/v1/imports/:batchId/stream', {
        event: 'done',
        data: {},
      }),
    ).toBe('event: done\ndata: {}\n\n')
  })
})
