import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DomainTrustBadge } from './domain-trust-badge'

describe('DomainTrustBadge', () => {
  it('renders Trusted label for trusted domain', () => {
    render(
      <DomainTrustBadge
        scoreNet={5}
        countUp={7}
        countDown={2}
      />,
    )
    const label = screen.getByText('Trusted')
    expect(label).toBeDefined()
    expect(label.className).toContain('dark:text-emerald-400')
  })

  it('renders Neutral label for neutral domain', () => {
    render(
      <DomainTrustBadge
        scoreNet={1}
        countUp={2}
        countDown={1}
      />,
    )
    expect(screen.getByText('Neutral')).toBeDefined()
  })

  it('renders Distrusted label for distrusted domain', () => {
    render(
      <DomainTrustBadge
        scoreNet={-5}
        countUp={1}
        countDown={6}
      />,
    )
    expect(screen.getByText('Distrusted')).toBeDefined()
  })

  it('renders Unrated label when no votes', () => {
    render(
      <DomainTrustBadge
        scoreNet={0}
        countUp={0}
        countDown={0}
      />,
    )
    expect(screen.getByText('Unrated')).toBeDefined()
  })

  it('renders a link to domain page when hostname is provided', () => {
    render(
      <DomainTrustBadge
        scoreNet={5}
        countUp={7}
        countDown={2}
        hostname='example.com'
      />,
    )
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/domain/example.com')
  })

  it('does not render a link when no hostname is provided', () => {
    render(
      <DomainTrustBadge
        scoreNet={5}
        countUp={7}
        countDown={2}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('supports xs size', () => {
    const { container } = render(
      <DomainTrustBadge
        scoreNet={5}
        countUp={7}
        countDown={2}
        size='xs'
      />,
    )
    expect(container.querySelector('.text-xs')).not.toBeNull()
  })
})
