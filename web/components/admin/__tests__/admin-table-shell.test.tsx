import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AdminTableShell } from '../admin-table-shell'

describe('AdminTableShell', () => {
  it('makes the horizontal scroll container named and keyboard focusable', () => {
    render(
      <AdminTableShell aria-label='Example records'>
        <table aria-label='Example table' />
      </AdminTableShell>,
    )

    const region = screen.getByRole('region', { name: 'Example records' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(region.tagName).toBe('SECTION')
  })
})
