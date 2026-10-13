import {
  installProxyTestDoubles,
  makeRequest,
  resetProxyTestDoubles,
} from '@/test-helpers/proxy-session.mock-support'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import proxy from '../proxy'

describe('post detail HTML cache dependencies', () => {
  let fetchMock: ReturnType<typeof installProxyTestDoubles>

  beforeEach(() => {
    fetchMock = installProxyTestDoubles()
  })

  afterEach(() => {
    resetProxyTestDoubles()
  })

  const cacheFill = (pathname: string) =>
    makeRequest({ pathname, headers: { 'x-voucha-request-kind': 'cache-fill' } }) as any

  it('forwards the visible author tag from the backend detail response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { headers: { 'Cache-Tag': 'user:author-id' } }),
    )

    const response = await proxy(cacheFill('/discussion/post-id'))

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:2900/api/v1/posts/post-id',
      expect.objectContaining({ method: 'GET', cache: 'no-store' }),
    )
    expect(response.headers.get('Cache-Tag')).toBe('user:author-id')
  })

  it('leaves anonymous posts untagged when the backend has no visible author', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}'))

    const response = await proxy(cacheFill('/review/post-id'))

    expect(response.headers.get('Cache-Tag')).toBeNull()
    expect(response.headers.get('Vary')).toBeNull()
  })

  it('prevents a shared cache fill when the author dependency lookup fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('backend unavailable'))

    const response = await proxy(cacheFill('/discussion/post-id'))

    expect(response.headers.get('Vary')).toBe('*')
  })

  it('does not cache an HTML page after a non-OK backend detail lookup', async () => {
    fetchMock.mockResolvedValueOnce(new Response('missing', { status: 404 }))

    const response = await proxy(cacheFill('/discussion/post-id'))

    expect(response.headers.get('Vary')).toBe('*')
  })

  it('rejects malformed or non-author origin cache tags', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { headers: { 'Cache-Tag': 'user:author-id,post:post-id' } }),
    )

    const response = await proxy(cacheFill('/discussion/post-id'))

    expect(response.headers.get('Cache-Tag')).toBeNull()
    expect(response.headers.get('Vary')).toBe('*')
  })

  it('does not request a dependency outside a post detail cache fill', async () => {
    await proxy(makeRequest({ pathname: '/discussion/post-id' }) as any)
    await proxy(cacheFill('/discussion/post-id/edit'))

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
