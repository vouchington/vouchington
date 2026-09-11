import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BulkActionToolbar, type ModerationBulkAction } from './bulk-action-toolbar'

function renderToolbar(overrides: Partial<ComponentProps<typeof BulkActionToolbar>> = {}) {
  const onActionChange = vi.fn<(action: ModerationBulkAction | null) => void>()
  const onClearSelection = vi.fn<() => void>()
  const onConfirm = vi.fn<(action: ModerationBulkAction) => void>()
  const onRemoveReasonChange = vi.fn<(value: string) => void>()

  const result = render(
    <BulkActionToolbar
      action={null}
      removeReason=''
      selectedCount={2}
      onActionChange={onActionChange}
      onClearSelection={onClearSelection}
      onConfirm={onConfirm}
      onRemoveReasonChange={onRemoveReasonChange}
      {...overrides}
    />,
  )

  return {
    ...result,
    onActionChange,
    onClearSelection,
    onConfirm,
    onRemoveReasonChange,
  }
}

describe('BulkActionToolbar', () => {
  it('does not render when no items are selected', () => {
    const { container } = renderToolbar({ selectedCount: 0 })

    expect(container.firstChild).toBeNull()
  })

  it('renders selected count and bulk action selectors', () => {
    const { container } = renderToolbar({ selectedCount: 1 })

    expect(screen.getByText('1 item selected')).toBeInTheDocument()
    expect(container.querySelector('[data-pw="moderation-selected-count"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="bulk-dismiss-button"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="bulk-remove-button"]')).not.toBeNull()

    const banButton = screen.getByRole('button', { name: /ban user/i })
    expect(banButton).toBeDisabled()
    expect(banButton).toHaveAttribute(
      'title',
      'Bulk user bans depend on the community ban model in #4801.',
    )

    const escalateButton = screen.getByRole('button', { name: /escalate/i })
    expect(escalateButton).toBeDisabled()
    expect(escalateButton).toHaveAttribute(
      'title',
      'Bulk escalation depends on claim/assign and escalation queues in #4820.',
    )
  })

  it('starts bulk actions and clears selection from toolbar buttons', () => {
    const { onActionChange, onClearSelection } = renderToolbar()

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))

    expect(onActionChange).toHaveBeenNthCalledWith(1, 'dismiss')
    expect(onActionChange).toHaveBeenNthCalledWith(2, 'remove')
    expect(onClearSelection).toHaveBeenCalledOnce()
  })

  it('disables removal when the viewer cannot remove reported content', () => {
    renderToolbar({ canRemove: false })

    const removeButton = screen.getByRole('button', { name: /remove/i })
    expect(removeButton).toBeDisabled()
    expect(removeButton).toHaveAttribute(
      'title',
      'Only administrators can bulk remove reported content.',
    )
  })

  it('confirms the selected action and supports cancelling it', () => {
    const { onActionChange, onConfirm } = renderToolbar({ action: 'dismiss' })

    expect(screen.getByText('Confirm dismissal for 2 selected items.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^confirm$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    expect(onConfirm).toHaveBeenCalledWith('dismiss')
    expect(onActionChange).toHaveBeenCalledWith(null)
  })

  it('renders and updates the optional bulk removal reason', () => {
    const { onRemoveReasonChange } = renderToolbar({
      action: 'remove',
      removeReason: 'Duplicate referral spam.',
      showRemoveReason: true,
    })

    const reasonField = screen.getByLabelText('Bulk removal reason')
    expect(reasonField).toHaveValue('Duplicate referral spam.')

    fireEvent.change(reasonField, { target: { value: 'Repeated spam.' } })

    expect(onRemoveReasonChange).toHaveBeenCalledWith('Repeated spam.')
  })

  it('does not render the removal reason when the optional field is hidden', () => {
    renderToolbar({ action: 'remove' })

    expect(screen.queryByLabelText('Bulk removal reason')).not.toBeInTheDocument()
  })

  it('renders the message when provided', () => {
    renderToolbar({ message: 'This is a custom message' })

    expect(screen.getByText('This is a custom message')).toBeInTheDocument()
  })

  it('disables all buttons when disabled prop is true', () => {
    renderToolbar({ disabled: true, action: 'dismiss' })

    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /remove/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^confirm$/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled()
  })
})
