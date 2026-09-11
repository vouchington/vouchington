import type { ReactElement, ReactNode } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/headers'), () => ({
  headers: vi.fn<VitestLooseMock>(),
}))

import { getCurrentUser } from '@/lib/auth/get-current-user'
import { headers } from 'next/headers'
import { ContributeCtaAside } from './contribute-cta-aside'

const mockGetCurrentUser = vi.mocked(getCurrentUser)
const mockHeaders = vi.mocked(headers)

describe('ContributeCtaAside', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHeaders.mockResolvedValue(new Headers())
  })

  it('renders nothing when not authenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    const result = await ContributeCtaAside()
    const { container } = render(result as ReactElement)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders contribution links for authenticated users', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    const result = await ContributeCtaAside()
    render(result as ReactElement)
    expect(screen.getByRole('heading', { name: 'Share your experience' })).toBeDefined()
    expect(screen.getByRole('link', { name: /Write a review/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Start a discussion/ })).toBeDefined()
    expect(screen.getByRole('link', { name: /Add a data point/ })).toBeDefined()
  })

  it('write a review link points to /reviews/create', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    const result = await ContributeCtaAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: /Write a review/ }).getAttribute('href')).toBe(
      '/reviews/create',
    )
  })

  it('start a discussion link points to /discussions/create', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    const result = await ContributeCtaAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: /Start a discussion/ }).getAttribute('href')).toBe(
      '/discussions/create',
    )
  })

  it('add a data point link points to /data-points/create', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: 'user-1', roles: [] })
    const result = await ContributeCtaAside()
    render(result as ReactElement)
    expect(screen.getByRole('link', { name: /Add a data point/ }).getAttribute('href')).toBe(
      '/data-points/create',
    )
  })
})
