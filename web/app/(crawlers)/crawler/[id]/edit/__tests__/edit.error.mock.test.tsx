import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrawlerEditForm } from '../crawler-edit-form'
import { updateCrawler } from '@/lib/api/client/admin'

const mockRouterPush = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/navigation'),
  () =>
    ({
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

vi.mock(import('@/lib/api/client/admin'), () => ({
  updateCrawler: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

const mockUpdate = vi.mocked(updateCrawler)

describe('CrawlerEditForm error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports update-crawler failures via onError fallback', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('Update failed'))

    render(
      <CrawlerEditForm
        crawlerId='crawler-1'
        crawler={{
          id: 'crawler-1',
          description: 'Existing',
          crawler_type: 'fetch',
          priority: 0,
          css_selectors_to_remove: [],
          link_text_content_to_remove: [],
          link_hrefs_to_remove: [],
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to update crawler')
    })
  })

  it('emits onSuccess and navigates on a successful update', async () => {
    mockUpdate.mockResolvedValueOnce({} as never)

    render(
      <CrawlerEditForm
        crawlerId='crawler-1'
        crawler={{
          id: 'crawler-1',
          description: 'Existing',
          crawler_type: 'fetch',
          priority: 0,
          css_selectors_to_remove: [],
          link_text_content_to_remove: [],
          link_hrefs_to_remove: [],
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Crawler updated')
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/crawler/crawler-1')
  })
})
