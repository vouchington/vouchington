import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import * as clientApi from '@/lib/api/client'
import * as importExportApi from '@/lib/api/client/import-export'
import * as importStreamApi from '@/lib/api/client/import-stream'
import { CreateSourceForm } from '../create-source-form'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'

vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ push: vi.fn<VitestLooseMock>() }),
    }) as unknown as typeof import('next/navigation'),
)

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

vi.mock(import('@/lib/api/client'), () => ({
  createSource: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/import-export'), () => ({
  importRssFeeds: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/import-stream'), () => ({
  streamImportProgress: vi.fn<VitestLooseMock>(),
}))

const mockImport = {
  id: 'import-id-456',
  total_rows: 2,
  completed_rows: 0,
  failed_rows: 0,
  pending_rows: 2,
  completed_at: null,
  created_at: '2026-05-31T00:00:00.000Z',
}

describe('CreateSourceForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(importStreamApi.streamImportProgress).mockResolvedValue(undefined)
  })

  it('renders textarea and submit button', () => {
    render(<CreateSourceForm />)

    expect(screen.getByRole('textbox', { name: /RSS Feed URLs/i })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Submit Source' })).toBeDefined()
  })

  it('submit button is disabled when textarea is empty', () => {
    render(<CreateSourceForm />)

    const button = screen.getByRole('button', { name: 'Submit Source' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('always calls createSource with follow: true', async () => {
    vi.mocked(clientApi.createSource).mockResolvedValue({
      status: 'created',
      rss_feed_id: 'rss-feed-id-1',
      topic_id: 'topic-id-1',
      topic_slug: 'test-feed',
    })

    render(<CreateSourceForm />)

    const textarea = screen.getByRole('textbox', { name: /RSS Feed URLs/i })
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(vi.mocked(clientApi.createSource)).toHaveBeenCalledWith({
        rss_feed_url: 'https://example.com/feed.xml',
        follow: true,
      })
    })
  })

  it('calls importRssFeeds then streams progress for multiple URLs', async () => {
    vi.mocked(importExportApi.importRssFeeds).mockResolvedValue({
      import: mockImport,
      status_url: `/api/v1/my/import/rss-feeds/${mockImport.id}`,
    })

    render(<CreateSourceForm />)

    const textarea = screen.getByRole('textbox', { name: /RSS Feed URLs/i })
    fireEvent.change(textarea, {
      target: { value: 'https://a.com/feed.xml\nhttps://b.com/feed.xml' },
    })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(vi.mocked(importExportApi.importRssFeeds)).toHaveBeenCalledWith({
        urls: ['https://a.com/feed.xml', 'https://b.com/feed.xml'],
        follow: true,
      })
    })
    await waitFor(() => {
      expect(vi.mocked(importStreamApi.streamImportProgress)).toHaveBeenCalledWith(
        mockImport.id,
        expect.any(Function),
        expect.anything(), // AbortSignal
      )
    })
  })

  it('Cmd+Enter and Ctrl+Enter on the URL textarea submit the form; plain Enter does not', () => {
    vi.mocked(clientApi.createSource).mockResolvedValue({
      status: 'created',
      rss_feed_id: 'rss-feed-id-1',
      topic_id: 'topic-id-1',
      topic_slug: 'test-feed',
    })

    render(<CreateSourceForm />)

    const textarea = screen.getByRole('textbox', {
      name: /RSS Feed URLs/i,
    }) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })

    // Listen for the native submit event so we can assert each keypress dispatches a submit;
    // the form's React onSubmit guards re-entry via the loading flag.
    const onSubmit = vi.fn<VitestLooseMock>()
    textarea.form!.addEventListener('submit', onSubmit)
    expectTextareaCmdEnterSubmits({ textarea, onSubmit })
  })

  it('displays progress indicator after batch submission', async () => {
    vi.mocked(importExportApi.importRssFeeds).mockResolvedValue({
      import: mockImport,
      status_url: `/api/v1/my/import/rss-feeds/${mockImport.id}`,
    })

    render(<CreateSourceForm />)

    const textarea = screen.getByRole('textbox', { name: /RSS Feed URLs/i })
    fireEvent.change(textarea, {
      target: { value: 'https://a.com/feed.xml\nhttps://b.com/feed.xml' },
    })

    const form = textarea.closest('form')!
    fireEvent.submit(form)

    // Progress bar renders processing text once the stream starts
    await waitFor(() => {
      expect(screen.getByText(/Processing|Done/)).toBeDefined()
    })
  })
})
