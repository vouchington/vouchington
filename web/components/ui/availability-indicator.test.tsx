import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AvailabilityIndicator } from './availability-indicator'

describe('AvailabilityIndicator', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<AvailabilityIndicator status='idle' />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing while checking', () => {
    const { container } = render(<AvailabilityIndicator status='checking' />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the available message with the label', () => {
    render(
      <AvailabilityIndicator
        status='available'
        label='topic slug'
      />,
    )
    const el = screen.getByText('topic slug available')
    expect(el).toBeInTheDocument()
    expect(el.closest('[data-pw="availability-indicator-available"]')).not.toBeNull()
  })

  it('shows the conflict children when taken with a conflict node', () => {
    render(
      <AvailabilityIndicator
        status='taken'
        label='community slug'
        conflict={<a href='/c/foo'>Foo</a>}
      />,
    )
    expect(screen.getByText('community slug used:')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Foo' })).toHaveAttribute('href', '/c/foo')
  })

  it('shows the generic taken message when there is no conflict node', () => {
    render(
      <AvailabilityIndicator
        status='taken'
        label='username'
      />,
    )
    expect(screen.getByText('username is already taken')).toBeInTheDocument()
  })

  it('shows the error message', () => {
    render(
      <AvailabilityIndicator
        status='error'
        label='slug'
      />,
    )
    expect(screen.getByText('Could not verify slug availability')).toBeInTheDocument()
  })

  it('defaults the label to "slug"', () => {
    render(<AvailabilityIndicator status='available' />)
    expect(screen.getByText('slug available')).toBeInTheDocument()
  })
})
