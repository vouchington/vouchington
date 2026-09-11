import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectInputEnterSubmits,
  expectTextareaCmdEnterSubmits,
} from '@/test-helpers/form-keyboard'
import EditCrawlerPage from '../page'

const mockRouterPush = vi.hoisted(() => vi.fn<VitestLooseMock>())
const mockGetCrawler = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useParams: () => ({ id: 'crawler-1' }),
      useRouter: () => ({ push: mockRouterPush }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        ...props
      }: {
        children: ReactNode
        href: string
        prefetch?: boolean
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

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        children,
        onValueChange,
        value,
      }: {
        children: ReactNode
        onValueChange?: (value: string) => void
        value?: string
      }) => (
        <select
          aria-label='Crawler Type'
          value={value}
          onChange={event => onValueChange?.(event.target.value)}
        >
          {children}
        </select>
      ),
      SelectContent: ({ children }: { children: ReactNode }) => children,
      SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
        <option value={value}>{children}</option>
      ),
      SelectTrigger: ({ children }: { children: ReactNode }) => children,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/server'), () => ({
  getCrawler: mockGetCrawler,
}))

const mockFetch = vi.fn<VitestLooseMock>()

function makeCrawler({
  crawlerType = 'fetch',
  cssSelectorsToRemove = [],
  description = 'Existing description',
  id = 'crawler-1',
  linkHrefsToRemove = [],
  linkTextContentToRemove = [],
  priority = 0,
}: {
  crawlerType?: string
  cssSelectorsToRemove?: string[]
  description?: string
  id?: string
  linkHrefsToRemove?: string[]
  linkTextContentToRemove?: string[]
  priority?: number
}) {
  return {
    id,
    description,
    crawler_type: crawlerType,
    priority,
    css_selectors_to_remove: cssSelectorsToRemove,
    link_text_content_to_remove: linkTextContentToRemove,
    link_hrefs_to_remove: linkHrefsToRemove,
  }
}

describe('edit.keyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCrawler.mockImplementation((id: string) =>
      Promise.resolve({ crawler: makeCrawler({ id }) }),
    )
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      return Promise.resolve({ ok: true, statusText: 'OK', json: () => Promise.resolve({}) })
    })
  })

  describe('EditCrawlerPage — keyboard submit', () => {
    it('resets the edit form when navigating between crawler ids', async () => {
      mockGetCrawler.mockImplementation((id: string) =>
        Promise.resolve({
          crawler:
            id === 'crawler-1'
              ? makeCrawler({
                  id,
                  description: 'First crawler',
                  crawlerType: 'fetch',
                  priority: 1,
                  cssSelectorsToRemove: ['.first-ad'],
                  linkTextContentToRemove: ['First promo'],
                  linkHrefsToRemove: ['/first-promo'],
                })
              : makeCrawler({
                  id,
                  description: 'Second crawler',
                  crawlerType: 'automation',
                  priority: 9,
                  cssSelectorsToRemove: ['.second-ad'],
                  linkTextContentToRemove: ['Second promo'],
                  linkHrefsToRemove: ['/second-promo'],
                }),
        }),
      )

      const { rerender } = render(
        await EditCrawlerPage({ params: Promise.resolve({ id: 'crawler-1' }) }),
      )

      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Unsaved first crawler edits' },
      })
      fireEvent.change(screen.getByLabelText('Priority'), { target: { value: '42' } })
      fireEvent.change(screen.getByLabelText(/CSS Selectors/), {
        target: { value: '.unsaved-ad' },
      })
      expect(screen.getByLabelText('Crawler Type')).toHaveValue('fetch')

      rerender(await EditCrawlerPage({ params: Promise.resolve({ id: 'crawler-2' }) }))

      expect(screen.getByLabelText('Description')).toHaveValue('Second crawler')
      expect(screen.getByLabelText('Crawler Type')).toHaveValue('automation')
      expect(screen.getByLabelText('Priority')).toHaveValue(9)
      expect(screen.getByLabelText(/CSS Selectors/)).toHaveValue('.second-ad')
      expect(screen.getByLabelText(/Link Text Content/)).toHaveValue('Second promo')
      expect(screen.getByLabelText(/Link Hrefs/)).toHaveValue('/second-promo')
    })

    it('Enter on the priority input submits via the PATCH fetch', async () => {
      render(await EditCrawlerPage({ params: Promise.resolve({ id: 'crawler-1' }) }))
      await screen.findByRole('heading', { level: 1, name: 'Edit Crawler' })

      const input = screen.getByLabelText('Priority') as HTMLInputElement
      fireEvent.change(input, { target: { value: '5' } })

      void expectInputEnterSubmits({ input, onSubmit: mockFetch })

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/v1/crawlers/crawler-1',
          expect.objectContaining({ method: 'PATCH' }),
        )
      })
    })

    it('Cmd+Enter and Ctrl+Enter on the description textarea submit; plain Enter does not', async () => {
      render(await EditCrawlerPage({ params: Promise.resolve({ id: 'crawler-1' }) }))
      await screen.findByRole('heading', { level: 1, name: 'Edit Crawler' })

      const textarea = screen.getByLabelText('Description') as HTMLTextAreaElement

      // Spy on the native submit event because the form's React onSubmit short-circuits
      // re-entry (saving state) between the three keydowns.
      const onSubmit = vi.fn<VitestLooseMock>()
      textarea.form!.addEventListener('submit', onSubmit)
      expectTextareaCmdEnterSubmits({ textarea, onSubmit })
    })
  })
})
