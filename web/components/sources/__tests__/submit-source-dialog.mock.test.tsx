import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SubmitSourceButton, SubmitSourceDialog } from '../submit-source-dialog'

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
  it('renders the submit button', () => {
    render(<SubmitSourceButton />)
    expect(screen.getByRole('button', { name: 'Submit Source' })).toBeDefined()
  })

  it('opens dialog on button click', () => {
    render(<SubmitSourceButton />)
    expect(screen.queryByText('Submit a Source')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Submit Source' }))
    expect(screen.getByText('Submit a Source')).toBeDefined()
  })
})

describe('SubmitSourceDialog', () => {
  it('renders nothing when closed', () => {
    render(
      <SubmitSourceDialog
        open={false}
        onOpenChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.queryByText('Submit a Source')).toBeNull()
  })

  it('renders dialog title when open', () => {
    render(
      <SubmitSourceDialog
        open
        onOpenChange={vi.fn<VitestLooseMock>()}
      />,
    )
    expect(screen.getByText('Submit a Source')).toBeDefined()
  })

  it('calls onOpenChange(false) when form onSuccess fires', () => {
    const onOpenChange = vi.fn<VitestLooseMock>()
    render(
      <SubmitSourceDialog
        open
        onOpenChange={onOpenChange}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'mock-submit' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
