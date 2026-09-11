import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LandingPagesIndex } from '../landing-pages-index'
import type { LandingPage } from '@/types/landing-pages'

const toastMock = { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() }
const routerMock = { push: vi.fn<VitestLooseMock>() }

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => routerMock,
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => toastMock.success(message),
}))

vi.mock(import('@/lib/api/client'), () => ({
  createMyLandingPage: vi.fn<VitestLooseMock>(),
}))

import { createMyLandingPage } from '@/lib/api/client'

const mockCreate = vi.mocked(createMyLandingPage)

function pw(container: HTMLElement, name: string): HTMLElement {
  const el = container.querySelector(`[data-pw="${name}"]`)
  if (!el) throw new Error(`missing data-pw="${name}"`)
  return el as HTMLElement
}

function makeRow(overrides?: Partial<LandingPage>): LandingPage {
  return {
    id: 'page-1',
    user_id: 'user-1',
    title: 'Default Page',
    subtitle: null,
    slug: 'default-page',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('LandingPagesIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ landing_page: makeRow({ slug: 'new-page' }) } as never)
  })

  it('renders the username-required gate when there is no username', () => {
    const { container } = render(
      <LandingPagesIndex
        username={null}
        initialPages={[]}
      />,
    )
    expect(pw(container, 'landing-pages-required-heading')).toBeDefined()
  })

  it('shows the empty state when there are no pages', () => {
    const { container } = render(
      <LandingPagesIndex
        username='tester'
        initialPages={[]}
      />,
    )
    expect(pw(container, 'landing-pages-empty-state')).toBeDefined()
    expect(pw(container, 'landing-pages-settings-heading')).toBeDefined()
  })

  it('lists pages with edit and view-live links', () => {
    const { container } = render(
      <LandingPagesIndex
        username='tester'
        initialPages={[makeRow(), makeRow({ id: 'page-2', slug: 'bonus', is_default: false })]}
      />,
    )
    const editButtons = container.querySelectorAll(
      '[data-pw^="landing-pages-settings-page-button-"]',
    )
    expect(editButtons.length).toBe(2)
    const live = container.querySelectorAll(
      '[data-pw="landing-pages-view-live-link"]',
    ) as NodeListOf<HTMLAnchorElement>
    expect(live[0]!.getAttribute('href')).toBe('/@tester')
    expect(live[1]!.getAttribute('href')).toBe('/@tester/bonus')
  })

  it('creates a page and navigates to the editor', async () => {
    const { container } = render(
      <LandingPagesIndex
        username='tester'
        initialPages={[]}
      />,
    )
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Page' } })
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'new-page' } })
    fireEvent.click(pw(container, 'landing-pages-create-button'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    await waitFor(() => expect(routerMock.push).toHaveBeenCalledWith('/my/landing-page/new-page'))
  })

  it('surfaces an error toast when creation fails', async () => {
    mockCreate.mockRejectedValue(new Error('boom'))
    const { container } = render(
      <LandingPagesIndex
        username='tester'
        initialPages={[]}
      />,
    )
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'X' } })
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'x' } })
    fireEvent.click(pw(container, 'landing-pages-create-button'))
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Failed to create landing page'),
    )
  })
})
