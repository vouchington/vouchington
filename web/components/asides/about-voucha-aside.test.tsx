import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AboutVouchaAside } from './about-voucha-aside'

describe('AboutVouchaAside', () => {
  it('renders its description in an expanded accordion', () => {
    render(<AboutVouchaAside />)
    const trigger = screen.getByRole('button', { name: 'About Voucha' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(
      screen.getByText(
        'Real data from real people. Browse reviews, data points, and discussions to make better decisions.',
      ),
    ).toBeVisible()
  })
})
