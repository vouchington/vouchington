import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DismissibleCtaAside } from './dismissible-cta-aside'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('DismissibleCtaAside', () => {
  it('renders configurable copy, link, and data-pw', () => {
    const { container } = render(
      <DismissibleCtaAside
        dismissKey='test-dismiss'
        title='Create something'
        description='Start a useful workflow.'
        href='/new'
        actionLabel='Create'
        data-pw='cta-aside'
      />,
    )

    expect(container.querySelector('[data-pw="cta-aside"]')).not.toBeNull()
    expect(screen.getByText('Create something')).toBeDefined()
    expect(screen.getByText('Start a useful workflow.')).toBeDefined()
    expect(screen.getByRole('link', { name: 'Create' }).getAttribute('href')).toBe('/new')
  })
})
