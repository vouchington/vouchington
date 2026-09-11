import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceHints } from './resource-hints'

const mockPreconnect = vi.hoisted(() =>
  vi.fn<(href: string, options?: { crossOrigin?: 'anonymous' | 'use-credentials' | '' }) => void>(),
)

vi.mock<typeof import('react-dom')>(import('react-dom'), async importOriginal => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  preconnect: mockPreconnect,
}))

describe('ResourceHints', () => {
  beforeEach(() => {
    mockPreconnect.mockClear()
  })

  it('preconnects to configured asset and image origins', () => {
    render(
      <ResourceHints
        assetPrefix='https://cdn.example.com/_next'
        imageOrigin='https://images.example.com/images'
      />,
    )

    expect(mockPreconnect).toHaveBeenCalledWith('https://cdn.example.com', { crossOrigin: '' })
    expect(mockPreconnect).toHaveBeenCalledWith('https://images.example.com', { crossOrigin: '' })
  })

  it('ignores relative and malformed origins', () => {
    render(
      <ResourceHints
        assetPrefix='/_next'
        imageOrigin='not-a-url'
      />,
    )

    expect(mockPreconnect).not.toHaveBeenCalled()
  })
})
