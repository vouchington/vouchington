import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmCsvImportDialog } from '../crm-csv-import-dialog'
import { importCrmCsv } from '@/lib/api/client/crm'

vi.mock(import('@/lib/api/client/crm'), () => ({
  importCrmCsv: vi.fn<VitestLooseMock>(),
  MAX_CRM_CSV_FILE_BYTES: 4 * 1024 * 1024,
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

const mockImport = vi.mocked(importCrmCsv)

function uploadFile(content: string, name = 'contacts.csv') {
  // The file input is hidden but findable via the DOM.
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([content], name, { type: 'text/csv' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

function uploadOversizedFile() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['header'], 'contacts.csv', { type: 'text/csv' })
  Object.defineProperty(file, 'size', { value: 4 * 1024 * 1024 + 1 })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('CrmCsvImportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows success toast after a valid import', async () => {
    mockImport.mockResolvedValueOnce({
      valid: true,
      batch: { id: 'batch-1', total_rows: 7 },
    } as never)

    render(<CrmCsvImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: /import csv/i }))

    uploadFile('email\nx@y.com')

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Queued 7 contacts for import')
    })
  })

  it('renders validation error messages when result.valid is false', async () => {
    mockImport.mockResolvedValueOnce({
      valid: false,
      error: 'Bad header',
      validation: {
        valid: false,
        rows: [
          {
            row_index: 0,
            valid: false,
            errors: ['missing email', 'follower_count must be a non-negative integer'],
          },
        ],
      },
    } as never)

    render(<CrmCsvImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: /import csv/i }))

    uploadFile('email\n')

    expect(await screen.findByText(/bad header/i)).toBeInTheDocument()
    expect(screen.getByText(/row 2: missing email/i)).toBeInTheDocument()
    expect(
      screen.getByText(/row 2: follower_count must be a non-negative integer/i),
    ).toBeInTheDocument()
  })

  it('reports import-csv failures via onError fallback', async () => {
    mockImport.mockRejectedValueOnce(new Error('Network down'))

    render(<CrmCsvImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: /import csv/i }))

    uploadFile('email\nx@y.com')

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Network down')
    })
  })

  it('rejects a CSV larger than the server limit before reading or uploading it', async () => {
    render(<CrmCsvImportDialog />)
    fireEvent.click(screen.getByRole('button', { name: /import csv/i }))

    uploadOversizedFile()

    expect(await screen.findByText('Failed to import CSV')).toBeInTheDocument()
    expect(mockImport).not.toHaveBeenCalled()
  })
})
