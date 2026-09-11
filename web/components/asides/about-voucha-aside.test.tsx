import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AboutVouchaAside } from './about-voucha-aside'

describe('AboutVouchaAside', () => {
  it('renders About Voucha title', () => {
    render(<AboutVouchaAside />)
    expect(screen.getByText('About Voucha')).toBeDefined()
  })

  it('renders educational description', () => {
    render(<AboutVouchaAside />)
    expect(
      screen.getByText(
        'Real data from real people. Browse reviews, data points, and discussions to make better decisions.',
      ),
    ).toBeDefined()
  })

  it('accordion trigger starts open by default', () => {
    render(<AboutVouchaAside />)
    const trigger = screen.getByRole('button', { name: 'About Voucha' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
