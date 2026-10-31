import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type {
  ClassifierPartitionRange,
  PartitionAction,
  PsqlAction,
  RequestPartitionRange,
} from './postgresql-state'
import { PostgreSQLActionsCard } from './postgresql-actions-card'
import { PsqlActionButton } from './postgresql-action-button'

describe('PostgreSQLActionsCard', () => {
  it('opens the matching confirmation action for each partition button', () => {
    const setPendingAction = vi.fn<(action: PartitionAction) => void>()

    render(
      <TooltipProvider>
        <PostgreSQLActionsCard
          actionLoading={{}}
          onAction={vi.fn<(action: PsqlAction) => void>()}
          setPendingAction={setPendingAction}
          setPendingClassifierAction={vi.fn<
            (action: PartitionAction, range: ClassifierPartitionRange) => void
          >()}
          setPendingRequestAction={vi.fn<
            (action: PartitionAction, range: RequestPartitionRange) => void
          >()}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create Partitions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cleanup Partitions' }))

    expect(setPendingAction).toHaveBeenNthCalledWith(1, 'createPartitions')
    expect(setPendingAction).toHaveBeenNthCalledWith(2, 'cleanupPartitions')
    expect(setPendingAction).toHaveBeenCalledTimes(2)
  })

  it('dispatches the selected database action and shows its pending state with a stable selector', () => {
    const onAction = vi.fn<(action: PsqlAction) => void>()
    const { rerender } = render(
      <PsqlActionButton
        action='runMigrations'
        label='Run Migrations'
        loading={false}
        onAction={onAction}
        dataPw='postgresql-run-migrations'
      />,
    )
    const action = screen.getByRole('button', { name: 'Run Migrations' })
    expect(action).toHaveAttribute('data-pw', 'postgresql-run-migrations')
    fireEvent.click(action)
    expect(onAction).toHaveBeenCalledExactlyOnceWith('runMigrations')

    rerender(
      <PsqlActionButton
        action='runMigrations'
        label='Run Migrations'
        loading
        onAction={onAction}
      />,
    )
    const pending = screen.getByRole('button', { name: 'Running...' })
    expect(pending).toBeDisabled()
    expect(pending).toHaveAttribute('data-pw', 'button')
    fireEvent.click(pending)
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})
