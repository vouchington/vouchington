import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LinkSelectDropdown } from './link-select-dropdown'

describe('LinkSelectDropdown', () => {
  it('keeps the visible filter label in the accessible name', () => {
    render(
      <LinkSelectDropdown
        label='Following'
        ariaLabel='Select feed filter'
        items={[{ label: 'Following', href: '/feed', active: true }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Select feed filter: Following' })).toHaveTextContent(
      'Following',
    )
  })

  it('does not repeat a visible label that is already in the accessible name', () => {
    render(
      <LinkSelectDropdown
        label='Following'
        ariaLabel='Select Following filter'
        items={[{ label: 'Following', href: '/feed', active: true }]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Select Following filter' })).toBeInTheDocument()
  })
})
