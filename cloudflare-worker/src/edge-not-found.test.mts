import { describe, expect, it } from 'vitest'
import { EDGE_HANDLER_HEADER, edgeNotFoundResponse } from './edge-not-found.mts'

describe('edgeNotFoundResponse', () => {
  it('returns the JSON 404 with a handler marker header', async () => {
    const response = edgeNotFoundResponse('cached-origin:sitemaps')
    expect(response.status).toBe(404)
    expect(response.headers.get(EDGE_HANDLER_HEADER)).toBe('cached-origin:sitemaps')
    expect(await response.json()).toEqual({ message: 'Not Found', code: 'NOT_FOUND' })
  })
})
