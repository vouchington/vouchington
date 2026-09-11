import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AnonymousStructuredDataScript } from './anonymous-structured-data-script'

const { mockGetCurrentUser, mockHeaders } = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn<VitestLooseMock>(),
  mockHeaders: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: mockGetCurrentUser,
}))

vi.mock(import('next/headers'), () => ({
  headers: mockHeaders,
}))

describe('AnonymousStructuredDataScript', () => {
  it('renders JSON-LD for anonymous viewers', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockHeaders.mockResolvedValue(new Headers({ 'x-nonce': 'nonce-123' }))

    const jsx = await AnonymousStructuredDataScript({
      data: {
        '@context': 'https://schema.org',
        '@type': 'Thing',
        name: 'Test schema',
      },
    })

    const { container } = render(jsx)

    const script = container.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(script?.nonce).toBe('nonce-123')
    expect(script?.innerHTML).toContain('"@type":"Thing"')
  })

  it('renders nothing for authenticated viewers', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1' })
    mockHeaders.mockResolvedValue(new Headers({ 'x-nonce': 'nonce-123' }))

    const jsx = await AnonymousStructuredDataScript({
      data: {
        '@context': 'https://schema.org',
        '@type': 'Thing',
        name: 'Hidden schema',
      },
    })

    expect(jsx).toBeNull()
  })
})
