import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { LandingPagesManager } from '../landing-pages-manager'
import type { LandingPageWithItems } from '@/types/landing-pages'

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
        info: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client'), () => ({
  createMyLandingPage: vi.fn<VitestLooseMock>(),
  deleteMyLandingPage: vi.fn<VitestLooseMock>(),
  getMyLandingPageClient: vi.fn<VitestLooseMock>(),
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

import { replaceMyLandingPageItems } from '@/lib/api/client'

const mockReplace = vi.mocked(replaceMyLandingPageItems)

const page: LandingPageWithItems = {
  id: 'page-1',
  user_id: 'user-1',
  title: 'My Page',
  subtitle: null,
  slug: 'my-page',
  is_default: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [],
}

function pw(container: HTMLElement, name: string): HTMLElement {
  const el = container.querySelector(`[data-pw="${name}"]`)
  if (!el) throw new Error(`missing data-pw="${name}"`)
  return el as HTMLElement
}

describe('LandingPagesManager free-form link add', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReplace.mockResolvedValue({ landing_page: page } as never)
  })

  it('adds a free-form link draft (default add type) and saves content', async () => {
    const { container } = render(
      <LandingPagesManager
        username='tester'
        initialPages={[
          {
            id: page.id,
            user_id: page.user_id,
            title: page.title,
            subtitle: page.subtitle,
            slug: page.slug,
            is_default: page.is_default,
            created_at: page.created_at,
            updated_at: page.updated_at,
          },
        ]}
        initialSelectedPage={page}
        candidates={{ profile_links: [], reviews: [], referral_links: [] }}
      />,
    )

    fireEvent.change(pw(container, 'landing-page-add-link-label'), { target: { value: 'My Link' } })
    fireEvent.change(pw(container, 'landing-page-add-link-url'), {
      target: { value: 'https://example.com' },
    })
    fireEvent.click(pw(container, 'landing-page-add-item-button'))

    fireEvent.click(pw(container, 'landing-page-save-content'))
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('page-1', {
        items: [{ type: 'link', label: 'My Link', url: 'https://example.com' }],
      }),
    )
  })
})
