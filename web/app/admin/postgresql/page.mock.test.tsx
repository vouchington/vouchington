import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { spyOnPsqlRequestClient } from '@/test-helpers/lib/api/client/psql-request-spy'
import PostgreSQLPage from './page'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => (key.includes('.confirm_') ? 'Confirm' : key),
}))

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('./postgresql-header'), () => ({ PostgreSQLHeader: () => <div /> }))
vi.mock(import('./postgresql-status-cards'), () => ({ PostgreSQLStatusCards: () => <div /> }))
vi.mock(import('./sync-articles-card'), () => ({ SyncArticlesCard: () => <div /> }))

class MockEventSource {
  onerror: (() => void) | null = null
  addEventListener() {}
  removeEventListener() {}
  close() {}
}

describe('PostgreSQLPage classifier operator', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sends the selected range and row budget through confirmation to the PSQL job API', async () => {
    vi.stubGlobal('EventSource', MockEventSource)
    const { get: mockGet, post: mockPost } = spyOnPsqlRequestClient()
    mockGet.mockResolvedValue({ applied: [], pending: [], total: 0 })
    mockPost.mockResolvedValue({ success: true })

    render(
      <TooltipProvider>
        <PostgreSQLPage />
      </TooltipProvider>,
    )

    const create = await screen.findByRole('button', { name: 'Create Classifier Range' })
    fireEvent.change(screen.getByLabelText('From (inclusive)'), {
      target: { value: '2020-02-01' },
    })
    fireEvent.change(screen.getByLabelText('To (exclusive)'), {
      target: { value: '2020-02-02' },
    })
    fireEvent.change(screen.getByLabelText('Rows per DEFAULT (maximum 5,000)'), {
      target: { value: '100' },
    })
    fireEvent.click(create)

    expect(screen.getByText(/Seal the three classifier result partitions/)).toBeVisible()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })
    expect(mockPost).toHaveBeenCalledWith('/api/v1/psql/jobs', {
      type: 'createPartitions',
      classifierRange: { fromDate: '2020-02-01', toDate: '2020-02-02', maxDefaultRows: 100 },
    })
  })
})
