import { crawlerEditNav } from '@/test-helpers/app/crawlers/crawler-edit-form.mock-support'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateCrawler } from '@/lib/api/client/admin'
import { CrawlerEditForm } from '../crawler-edit-form'

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

vi.mock(import('@/lib/api/client/admin'), () => ({
  updateCrawler: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: (_err: unknown, options: { fallback: string }) => {
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
    crawlerEditNav.reset()
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
    expect(crawlerEditNav.push).toHaveBeenCalledWith('/crawler/crawler-1')
  })
})
