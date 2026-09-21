import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReviewButtons } from './copyright-staff-review-buttons'

describe('ReviewButtons', () => {
  it('records approve and reject through the supplied submit handler', () => {
    const submit = vi.fn<(action: () => Promise<unknown>, success: string) => void>()
    const approve = vi.fn<() => Promise<unknown>>()
    const reject = vi.fn<() => Promise<unknown>>()
    render(
      <ReviewButtons
        pending={false}
        canSubmit
        submit={submit}
        approve={approve}
        reject={reject}
        heading='Form intake'
        description='Accept or reject this intake.'
        approveLabel='Approve intake'
        rejectLabel='Reject intake'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Approve intake' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject intake' }))
    expect(submit).toHaveBeenNthCalledWith(1, approve, 'Approve intake recorded.')
    expect(submit).toHaveBeenNthCalledWith(2, reject, 'Reject intake recorded.')
  })
})
