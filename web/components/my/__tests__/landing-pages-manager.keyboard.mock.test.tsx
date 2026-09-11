import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
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

import { createMyLandingPage, getMyLandingPageClient, updateMyLandingPage } from '@/lib/api/client'

const mockCreate = vi.mocked(createMyLandingPage)
const mockGet = vi.mocked(getMyLandingPageClient)
const mockUpdate = vi.mocked(updateMyLandingPage)

const baseSelectedPage: LandingPageWithItems = {
  id: 'page-1',
  user_id: 'user-1',
  title: 'My Page',
  subtitle: 'A subtitle',
  slug: 'my-page',
  is_default: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  items: [],
}

const baseProps = {
  username: 'tester',
  initialPages: [
    {
      id: baseSelectedPage.id,
      user_id: baseSelectedPage.user_id,
      title: baseSelectedPage.title,
      subtitle: baseSelectedPage.subtitle,
      slug: baseSelectedPage.slug,
      is_default: baseSelectedPage.is_default,
      created_at: baseSelectedPage.created_at,
      updated_at: baseSelectedPage.updated_at,
    },
  ],
  initialSelectedPage: baseSelectedPage,
  candidates: { profile_links: [], reviews: [], referral_links: [] },
}

describe('LandingPagesManager keyboard submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreate.mockResolvedValue({ landing_page: baseSelectedPage } as never)
    mockGet.mockResolvedValue({ landing_page: baseSelectedPage } as never)
    mockUpdate.mockResolvedValue({ landing_page: baseSelectedPage } as never)
  })

  it('Enter on the create-form Title input triggers createMyLandingPage', async () => {
    render(
      <LandingPagesManager
        {...baseProps}
        initialPages={[]}
        initialSelectedPage={null}
      />,
    )
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(titleInput, { target: { value: 'New Page' } })
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'new-page' },
    })
    void expectInputEnterSubmits({ input: titleInput, onSubmit: mockCreate })
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled()
    })
  })

  it('Cmd+Enter / Ctrl+Enter in the page-details Subtitle textarea triggers updateMyLandingPage', () => {
    render(<LandingPagesManager {...baseProps} />)
    const textarea = document.querySelector('textarea#landing-page-subtitle') as HTMLTextAreaElement
    expect(textarea).not.toBeNull()
    expectTextareaCmdEnterSubmits({ textarea, onSubmit: mockUpdate })
  })
})
