import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppealDialog } from '../appeal-dialog'

// Stub AppealForm so this test stays focused on dialog open/close wiring
vi.mock(
  import('../appeal-form'),
  () =>
    ({
      AppealForm: ({
        targetType,
        targetId,
        onSuccess,
      }: {
        targetType: string
        targetId: string
        onSuccess?: () => void
      }) => (
        <div data-testid='appeal-form-stub'>
          <span data-testid='target-type'>{targetType}</span>
          <span data-testid='target-id'>{targetId}</span>
          <button
            type='button'
            onClick={onSuccess}
          >
            Trigger success
          </button>
        </div>
      ),
    }) as unknown as typeof import('../appeal-form'),
)

describe('AppealDialog', () => {
  it('renders "File an appeal" trigger button', () => {
    render(<AppealDialog warningId='warn-1' />)
    expect(screen.getByRole('button', { name: 'File an appeal' })).toBeDefined()
  })

  it('opens dialog when trigger is clicked and passes warningId as targetId', async () => {
    render(<AppealDialog warningId='warn-42' />)
    fireEvent.click(screen.getByRole('button', { name: 'File an appeal' }))

    expect(await screen.findByTestId('appeal-form-stub')).toBeDefined()
    expect(screen.getByTestId('target-type').textContent).toBe('warning')
    expect(screen.getByTestId('target-id').textContent).toBe('warn-42')
  })

  it('opens dialog and passes communityBanId as targetId with ban type', async () => {
    render(<AppealDialog communityBanId='ban-7' />)
    fireEvent.click(screen.getByRole('button', { name: 'File an appeal' }))

    expect(await screen.findByTestId('appeal-form-stub')).toBeDefined()
    expect(screen.getByTestId('target-type').textContent).toBe('ban')
    expect(screen.getByTestId('target-id').textContent).toBe('ban-7')
  })

  it('opens dialog and passes postId as targetId with removal type', async () => {
    render(<AppealDialog postId='post-9' />)
    fireEvent.click(screen.getByRole('button', { name: 'File an appeal' }))

    expect(await screen.findByTestId('appeal-form-stub')).toBeDefined()
    expect(screen.getByTestId('target-type').textContent).toBe('removal')
    expect(screen.getByTestId('target-id').textContent).toBe('post-9')
  })

  it('closes dialog when AppealForm calls onSuccess', async () => {
    render(<AppealDialog warningId='warn-1' />)
    fireEvent.click(screen.getByRole('button', { name: 'File an appeal' }))

    expect(await screen.findByTestId('appeal-form-stub')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Trigger success' }))

    // After onSuccess, the dialog should close and the form stub should be gone
    expect(screen.queryByTestId('appeal-form-stub')).toBeNull()
  })
})
