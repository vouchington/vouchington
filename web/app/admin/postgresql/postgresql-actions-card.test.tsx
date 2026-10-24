import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PartitionAction, PsqlAction } from './postgresql-state'
import { PostgreSQLActionsCard } from './postgresql-actions-card'

describe('PostgreSQLActionsCard', () => {
  it('opens the matching confirmation action for each partition button', () => {
    const setPendingAction = vi.fn<(action: PartitionAction) => void>()

    render(
      <TooltipProvider>
        <PostgreSQLActionsCard
          actionLoading={{}}
          onAction={vi.fn<(action: PsqlAction) => void>()}
          setPendingAction={setPendingAction}
        />
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create Partitions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cleanup Partitions' }))

    expect(setPendingAction).toHaveBeenNthCalledWith(1, 'createPartitions')
    expect(setPendingAction).toHaveBeenNthCalledWith(2, 'cleanupPartitions')
    expect(setPendingAction).toHaveBeenCalledTimes(2)
  })
})
