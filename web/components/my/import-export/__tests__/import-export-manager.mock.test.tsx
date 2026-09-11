import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ImportExportManager } from '../import-export-manager'
import {
  exportRssFeeds,
  exportTopics,
  importRssFeeds,
  importTopics,
  preflightExport,
} from '@/lib/api/client/import-export'
import { streamImportProgress } from '@/lib/api/client/import-stream'
import onError from '@/lib/on-error'

vi.mock(import('@/lib/api/client/import-export'), () => ({
  exportRssFeeds: vi.fn<VitestLooseMock>(),
  exportTopics: vi.fn<VitestLooseMock>(),
  importRssFeeds: vi.fn<VitestLooseMock>(),
  importTopics: vi.fn<VitestLooseMock>(),
  preflightExport: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/import-stream'), () => ({
  streamImportProgress: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

const mockExportRssFeeds = vi.mocked(exportRssFeeds)
const mockExportTopics = vi.mocked(exportTopics)
const mockImportRssFeeds = vi.mocked(importRssFeeds)
const mockImportTopics = vi.mocked(importTopics)
const mockPreflightExport = vi.mocked(preflightExport)
const mockStreamImportProgress = vi.mocked(streamImportProgress)
const mockOnError = vi.mocked(onError)

const mockImport = {
  id: 'import-id-123',
  total_rows: 2,
  completed_rows: 0,
  failed_rows: 0,
  pending_rows: 2,
  completed_at: null,
  created_at: '2026-05-31T00:00:00.000Z',
}

describe('ImportExportManager', () => {
  beforeAll(() => {
    // JSDOM does not implement HTMLAnchorElement navigation.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(vi.fn<VitestLooseMock>())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockExportRssFeeds.mockReturnValue('/api/v1/my/export/rss-feeds')
    mockExportTopics.mockReturnValue('/api/v1/my/export/topics?download=1')
    mockPreflightExport.mockResolvedValue(undefined)
    mockImportRssFeeds.mockResolvedValue({
      import: mockImport,
      status_url: `/api/v1/my/import/rss-feeds/${mockImport.id}`,
    })
    mockImportTopics.mockResolvedValue({ results: [] })
    mockStreamImportProgress.mockResolvedValue(undefined)
  })

  it('renders export and import cards', () => {
    render(<ImportExportManager feedType='article' />)
    expect(screen.getByText('Export')).toBeDefined()
    expect(screen.getByText('Import Sources')).toBeDefined()
    expect(screen.getByRole('button', { name: /export opml/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /export csv/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /import urls/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /upload file/i })).toBeDefined()
  })

  it('Export OPML button calls exportRssFeeds with format opml', async () => {
    render(<ImportExportManager feedType='article' />)
    fireEvent.click(screen.getByRole('button', { name: /export opml/i }))
    await waitFor(() => {
      expect(mockExportRssFeeds).toHaveBeenCalledWith('article', 'opml')
    })
  })

  it('Export CSV button calls exportRssFeeds with format csv', async () => {
    render(<ImportExportManager feedType='article' />)
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() => {
      expect(mockExportRssFeeds).toHaveBeenCalledWith('article', 'csv')
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    })
  })

  it('dropdown is present for non-topics feedType', () => {
    render(<ImportExportManager feedType='article' />)
    expect(document.querySelector('[data-pw="import-export-type-select"]')).not.toBeNull()
  })

  it('topics feedType does not show source-type dropdown', () => {
    render(<ImportExportManager feedType='topics' />)
    expect(document.querySelector('[data-pw="import-export-type-select"]')).toBeNull()
  })

  it('Export Topics button calls exportTopics', async () => {
    render(<ImportExportManager feedType='topics' />)
    fireEvent.click(screen.getByRole('button', { name: /export topics/i }))
    await waitFor(() => {
      expect(mockExportTopics).toHaveBeenCalledOnce()
      expect(mockPreflightExport).toHaveBeenCalledWith('/api/v1/my/export/topics?download=1')
    })
  })

  it('reports a failed export preflight without starting a browser download', async () => {
    mockPreflightExport.mockRejectedValue(new Error('export failed'))
    render(<ImportExportManager feedType='topics' />)

    fireEvent.click(screen.getByRole('button', { name: /export topics/i }))

    await waitFor(() => expect(mockOnError).toHaveBeenCalled())
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })

  it('Import URLs calls importRssFeeds with parsed URLs then streams progress', async () => {
    render(<ImportExportManager feedType='article' />)
    const textarea = screen.getByLabelText('Source URLs to import')
    fireEvent.change(textarea, {
      target: { value: 'https://example.com/feed.xml\nhttps://other.com/rss' },
    })
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    await waitFor(() => {
      expect(mockImportRssFeeds).toHaveBeenCalledWith({
        urls: ['https://example.com/feed.xml', 'https://other.com/rss'],
        follow: true,
      })
    })
    await waitFor(() => {
      expect(mockStreamImportProgress).toHaveBeenCalledWith(
        mockImport.id,
        expect.any(Function),
        expect.anything(), // AbortSignal
      )
    })
  })

  it('shows progress indicator after a successful URL import', async () => {
    render(<ImportExportManager feedType='article' />)
    const textarea = screen.getByLabelText('Source URLs to import')
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    await waitFor(() => {
      expect(screen.getByText(/Processing|Done/)).toBeDefined()
    })
  })

  it('clears the URL textarea after a successful URL import', async () => {
    render(<ImportExportManager feedType='article' />)
    const textarea = screen.getByLabelText('Source URLs to import') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    await waitFor(() => {
      expect(textarea.value).toBe('')
    })
  })

  it('shows an error toast when no URLs are entered and does not call importRssFeeds', async () => {
    const { toast } = await import('sonner')
    render(<ImportExportManager feedType='article' />)
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    expect(mockImportRssFeeds).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })

  it('calls importRssFeeds with opml when an OPML file is uploaded', async () => {
    render(<ImportExportManager feedType='article' />)
    const fileContent = '<opml version="2.0"/>'
    const file = new File([fileContent], 'feeds.opml', { type: 'text/xml' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(mockImportRssFeeds).toHaveBeenCalledWith({ opml: fileContent, follow: true })
    })
  })

  it('calls importTopics with topic names when feedType is topics', async () => {
    render(<ImportExportManager feedType='topics' />)
    const textarea = screen.getByLabelText('Topic names to import')
    fireEvent.change(textarea, { target: { value: 'Tech\nFinance' } })
    fireEvent.click(screen.getByRole('button', { name: /import topics/i }))
    await waitFor(() => {
      expect(mockImportTopics).toHaveBeenCalledWith({ names: ['Tech', 'Finance'] })
    })
  })

  it('calls onError when some topics fail to import', async () => {
    mockImportTopics.mockResolvedValue({
      results: [
        { input: 'Tech', status: 'followed', entity_id: 'id-1' },
        { input: 'BadTopic', status: 'error', error: 'not found' },
      ],
    })
    render(<ImportExportManager feedType='topics' />)
    const textarea = screen.getByLabelText('Topic names to import')
    fireEvent.change(textarea, { target: { value: 'Tech\nBadTopic' } })
    fireEvent.click(screen.getByRole('button', { name: /import topics/i }))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('calls onError when importRssFeeds rejects during URL import', async () => {
    mockImportRssFeeds.mockRejectedValue(new Error('import failed'))
    render(<ImportExportManager feedType='article' />)
    const textarea = screen.getByLabelText('Source URLs to import')
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })

  it('calls onError when importRssFeeds rejects during OPML upload', async () => {
    mockImportRssFeeds.mockRejectedValue(new Error('import failed'))
    render(<ImportExportManager feedType='article' />)
    const fileContent = '<opml version="2.0"/>'
    const file = new File([fileContent], 'feeds.opml', { type: 'text/xml' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(mockOnError).toHaveBeenCalled()
    })
  })
})
