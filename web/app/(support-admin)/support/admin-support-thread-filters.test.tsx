import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminSupportThreadFilters } from './admin-support-thread-filters'

describe('AdminSupportThreadFilters', () => {
  it('preserves a dirty query when pending status navigation synchronizes server props', async () => {
    const { rerender } = render(
      <AdminSupportThreadFilters
        initialQ='before'
        initialStatus='open'
        isPending
        onChange={() => {}}
      />,
    )
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'typed while pending' } })
    rerender(
      <AdminSupportThreadFilters
        initialQ='before'
        initialStatus='resolved'
        isPending={false}
        onChange={() => {}}
      />,
    )
    await Promise.resolve()
    expect(input).toHaveValue('typed while pending')
  })
})
