import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SubmitSourceButton } from '../submit-source-dialog'

vi.mock(import('../create-source-form'), () => ({
  CreateSourceForm: vi.fn<VitestLooseMock>(({ onSuccess }: { onSuccess?: () => void }) => (
    <button
      type='button'
      onClick={onSuccess}
    >
      mock-submit
    </button>
  )),
}))

describe('SubmitSourceButton', () => {
  it('opens the dialog and closes it after successful form submission', () => {
    render(<SubmitSourceButton />)
    expect(screen.queryByText('Submit a Source')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Source' }))
    expect(screen.getByText('Submit a Source')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'mock-submit' }))
    expect(screen.queryByText('Submit a Source')).toBeNull()
  })
})
