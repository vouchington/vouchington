import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PostgreSQLActionsCard } from './postgresql-actions-card'

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => key,
}))

describe('PostgreSQLActionsCard classifier ranges', () => {
  it('requires an ordered date range and bounded row budget before confirming operator actions', () => {
    const setPendingClassifierAction =
      vi.fn<Parameters<typeof PostgreSQLActionsCard>[0]['setPendingClassifierAction']>()

    render(
      <TooltipProvider>
        <PostgreSQLActionsCard
          actionLoading={{}}
          onAction={vi.fn<Parameters<typeof PostgreSQLActionsCard>[0]['onAction']>()}
          setPendingAction={vi.fn<
            Parameters<typeof PostgreSQLActionsCard>[0]['setPendingAction']
          >()}
          setPendingClassifierAction={setPendingClassifierAction}
        />
      </TooltipProvider>,
    )

    const create = screen.getByRole('button', { name: 'Create Classifier Range' })
    const retire = screen.getByRole('button', { name: 'Retire Classifier Range' })
    expect(create).toBeDisabled()
    expect(retire).toBeDisabled()

    fireEvent.change(screen.getByLabelText('From (inclusive)'), {
      target: { value: '2020-02-02' },
    })
    fireEvent.change(screen.getByLabelText('To (exclusive)'), {
      target: { value: '2020-02-01' },
    })
    expect(create).toBeDisabled()

    fireEvent.change(screen.getByLabelText('From (inclusive)'), {
      target: { value: '2020-02-01' },
    })
    fireEvent.change(screen.getByLabelText('To (exclusive)'), {
      target: { value: '2020-02-02' },
    })
    fireEvent.change(screen.getByLabelText('Rows per DEFAULT (maximum 5,000)'), {
      target: { value: '5001' },
    })
    expect(create).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Rows per DEFAULT (maximum 5,000)'), {
      target: { value: '100' },
    })
    expect(create).toBeEnabled()
    expect(retire).toBeEnabled()

    fireEvent.click(create)
    expect(setPendingClassifierAction).toHaveBeenCalledWith('createPartitions', {
      fromDate: '2020-02-01',
      toDate: '2020-02-02',
      maxDefaultRows: 100,
    })
    fireEvent.click(retire)
    expect(setPendingClassifierAction).toHaveBeenCalledWith('cleanupPartitions', {
      fromDate: '2020-02-01',
      toDate: '2020-02-02',
    })
  })
})
