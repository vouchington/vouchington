import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ImportExportManager } from '../import-export-manager'
import { importRssFeeds } from '@/lib/api/client/import-export'
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

const mockImportRssFeeds = vi.mocked(importRssFeeds)
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

describe('ImportExportManager — file import and stream', () => {
  beforeAll(() => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(vi.fn<VitestLooseMock>())
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockImportRssFeeds.mockResolvedValue({
      import: mockImport,
      status_url: `/api/v1/my/import/rss-feeds/${mockImport.id}`,
    })
    mockStreamImportProgress.mockResolvedValue(undefined)
  })

  it('calls importRssFeeds with csv field when a CSV file is uploaded', async () => {
    render(<ImportExportManager feedType='article' />)
    const csvContent = 'url\nhttps://example.com/rss'
    const file = new File([csvContent], 'feeds.csv', { type: 'text/csv' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(mockImportRssFeeds).toHaveBeenCalledWith({ csv: csvContent, follow: true })
    })
  })

  it('rejects files whose encoded JSON request body exceeds 2 MiB', async () => {
    const { toast } = await import('sonner')
    render(<ImportExportManager feedType='article' />)
    const bigFile = new File(['"'.repeat(1024 * 1024 + 1)], 'big.opml', { type: 'text/xml' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [bigFile] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('2 MiB'))
    })
    expect(mockImportRssFeeds).not.toHaveBeenCalled()
  })

  it('rejects a raw file larger than 2 MiB without reading it', async () => {
    const { toast } = await import('sonner')
    render(<ImportExportManager feedType='article' />)
    const bigFile = new File(['small'], 'big.opml', { type: 'text/xml' })
    Object.defineProperty(bigFile, 'size', { value: 2 * 1024 * 1024 + 1 })
    const text = vi.spyOn(bigFile, 'text')
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [bigFile] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('2 MiB'))
    })
    expect(text).not.toHaveBeenCalled()
    expect(mockImportRssFeeds).not.toHaveBeenCalled()
  })

  it('accepts a file when its encoded JSON request body is exactly 2 MiB', async () => {
    render(<ImportExportManager feedType='article' />)
    const wrapperBytes = new TextEncoder().encode(JSON.stringify({ opml: '', follow: true })).length
    const fileContent = 'x'.repeat(2 * 1024 * 1024 - wrapperBytes)
    const file = new File([fileContent], 'feeds.xml', { type: 'text/xml' })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)
    await waitFor(() => {
      expect(mockImportRssFeeds).toHaveBeenCalledWith({ opml: fileContent, follow: true })
    })
  })

  it('invokes progress callback during stream', async () => {
    mockStreamImportProgress.mockImplementation(async (_id, onProgress) => {
      onProgress({ batchId: mockImport.id, completed: 1, failed: 0, total: 2, done: false })
    })
    render(<ImportExportManager feedType='article' />)
    const textarea = screen.getByLabelText('Source URLs to import')
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    await waitFor(() => {
      expect(screen.getByText(/Processing|Done/)).toBeDefined()
    })
  })

  it('swallows AbortError from stream without calling onError', async () => {
    const abortError = Object.assign(new Error('abort'), { name: 'AbortError' })
    mockStreamImportProgress.mockRejectedValue(abortError)
    render(<ImportExportManager feedType='article' />)
    const textarea = screen.getByLabelText('Source URLs to import')
    fireEvent.change(textarea, { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: /import urls/i }))
    await waitFor(() => {
      expect(mockStreamImportProgress).toHaveBeenCalled()
    })
    expect(mockOnError).not.toHaveBeenCalled()
  })
})
