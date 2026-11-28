import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VouchaLogo } from './voucha-logo'

describe('VouchaLogo', () => {
  it('renders an SVG element', () => {
    const { container } = render(<VouchaLogo />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('has aria-label for accessibility', () => {
    const { container } = render(<VouchaLogo />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-label')).toBe('Voucha')
  })

  it('has role img', () => {
    const { container } = render(<VouchaLogo />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('role')).toBe('img')
  })

  it('renders data-pw for Playwright targeting', () => {
    const { container } = render(<VouchaLogo />)
    expect(container.querySelector('[data-pw="voucha-logo"]')).not.toBeNull()
  })
})
