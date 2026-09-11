import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LandingPageEditor } from '../landing-page-editor'
import type { LandingPageCandidates, LandingPageWithItems } from '@/types/landing-pages'

const toastMock = { success: vi.fn<VitestLooseMock>(), error: vi.fn<VitestLooseMock>() }
const routerMock = { push: vi.fn<VitestLooseMock>(), replace: vi.fn<VitestLooseMock>() }

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
  deleteMyLandingPage: vi.fn<VitestLooseMock>(),
  replaceMyLandingPageItems: vi.fn<VitestLooseMock>(),
  setDefaultMyLandingPage: vi.fn<VitestLooseMock>(),
  updateMyLandingPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      SelectTrigger: () => null,
      SelectValue: () => null,
      SelectContent: () => null,
      SelectItem: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

import {
  deleteMyLandingPage,
  replaceMyLandingPageItems,
  setDefaultMyLandingPage,
  updateMyLandingPage,
} from '@/lib/api/client'

const mockDelete = vi.mocked(deleteMyLandingPage)
const mockReplace = vi.mocked(replaceMyLandingPageItems)
const mockSetDefault = vi.mocked(setDefaultMyLandingPage)
const mockUpdate = vi.mocked(updateMyLandingPage)

function makePage(overrides?: Partial<LandingPageWithItems>): LandingPageWithItems {
  return {
    id: 'page-1',
    user_id: 'user-1',
    title: 'My Page',
    subtitle: 'A subtitle',
    slug: 'my-page',
    is_default: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    items: [{ id: 'item-1', type: 'link', label: 'Existing', url: 'https://existing.example' }],
    ...overrides,
  }
}

const candidates: LandingPageCandidates = { profile_links: [], reviews: [], referral_links: [] }

function pw(container: HTMLElement, name: string): HTMLElement {
  const el = container.querySelector(`[data-pw="${name}"]`)
  if (!el) throw new Error(`missing data-pw="${name}"`)
  return el as HTMLElement
}

describe('LandingPageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({ landing_page: makePage() } as never)
    mockReplace.mockResolvedValue({ landing_page: makePage() } as never)
    mockSetDefault.mockResolvedValue({ landing_page: makePage({ is_default: true }) } as never)
    mockDelete.mockResolvedValue(undefined as never)
  })

  it('renders the editor with a preview link to the public slug page', () => {
    const { container } = render(
      <LandingPageEditor
        initialPage={makePage()}
        candidates={candidates}
        username='tester'
      />,
    )
    expect(pw(container, 'landing-page-editor')).toBeDefined()
    expect(pw(container, 'landing-page-editor-preview').getAttribute('href')).toBe(
      '/@tester/my-page',
    )
  })

  it('uses the bare username path for the default page preview', () => {
    const { container } = render(
      <LandingPageEditor
        initialPage={makePage({ is_default: true })}
        candidates={candidates}
        username='tester'
      />,
    )
    expect(pw(container, 'landing-page-editor-preview').getAttribute('href')).toBe('/@tester')
  })

  it('adds a free-form link draft item then saves content', async () => {
    const { container } = render(
      <LandingPageEditor
        initialPage={makePage({ items: [] })}
        candidates={candidates}
        username='tester'
      />,
    )
    const addButton = pw(container, 'landing-page-add-item-button') as HTMLButtonElement
    expect(addButton.disabled).toBe(true)

    fireEvent.change(pw(container, 'landing-page-add-link-label'), { target: { value: 'My Link' } })
    fireEvent.change(pw(container, 'landing-page-add-link-url'), {
      target: { value: 'https://example.com' },
    })
    expect(addButton.disabled).toBe(false)

    fireEvent.click(addButton)
    expect(screen.getByText('My Link')).toBeDefined()

    fireEvent.click(pw(container, 'landing-page-save-content'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
    expect(toastMock.success).toHaveBeenCalledWith('Landing page content saved')
  })

  it('keeps the Add button disabled for an invalid (fragment) URL', () => {
    const { container } = render(
      <LandingPageEditor
        initialPage={makePage({ items: [] })}
        candidates={candidates}
        username='tester'
      />,
    )
    fireEvent.change(pw(container, 'landing-page-add-link-label'), { target: { value: 'Frag' } })
    fireEvent.change(pw(container, 'landing-page-add-link-url'), {
      target: { value: 'https://example.com/#section' },
    })
    expect((pw(container, 'landing-page-add-item-button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves page details and navigates when the slug changes', async () => {
    mockUpdate.mockResolvedValue({ landing_page: makePage({ slug: 'renamed' }) } as never)
    const { container } = render(
      <LandingPageEditor
        initialPage={makePage()}
        candidates={candidates}
        username='tester'
      />,
    )
    fireEvent.change(container.querySelector('input#landing-page-slug') as HTMLInputElement, {
      target: { value: 'renamed' },
    })
    fireEvent.submit(container.querySelector('form') as HTMLFormElement)
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled())
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/my/landing-page/renamed'))
  })

  it('sets the page as default', async () => {
    render(
      <LandingPageEditor
        initialPage={makePage()}
        candidates={candidates}
        username='tester'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Make default' }))
    await waitFor(() => expect(mockSetDefault).toHaveBeenCalledWith('page-1'))
  })

  it('deletes the page and navigates back to the index', async () => {
    render(
      <LandingPageEditor
        initialPage={makePage()}
        candidates={candidates}
        username='tester'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('page-1'))
    expect(routerMock.push).toHaveBeenCalledWith('/my/landing-pages')
  })

  it('removes a draft item', () => {
    render(
      <LandingPageEditor
        initialPage={makePage()}
        candidates={candidates}
        username='tester'
      />,
    )
    expect(screen.getByText('Existing')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.queryByText('Existing')).toBeNull()
  })

  it('surfaces an error toast when saving content fails', async () => {
    mockReplace.mockRejectedValue(new Error('boom'))
    const { container } = render(
      <LandingPageEditor
        initialPage={makePage()}
        candidates={candidates}
        username='tester'
      />,
    )
    fireEvent.click(pw(container, 'landing-page-save-content'))
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Failed to save landing page content'),
    )
  })
})
