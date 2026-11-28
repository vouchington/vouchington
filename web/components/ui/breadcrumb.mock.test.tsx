import type { ReactNode } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Breadcrumbs } from './breadcrumb'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('Breadcrumbs', () => {
  it('renders nothing for empty items', () => {
    const { container } = render(<Breadcrumbs items={[]} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders all breadcrumb items', () => {
    render(
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Topics', path: '/topics' },
          { name: 'Create', path: '/topics/create' },
        ]}
      />,
    )
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Topics')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()
  })

  it('renders the last item as the current page', () => {
    render(
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Current', path: '/current' },
        ]}
      />,
    )
    const current = screen.getByText('Current')
    expect(current.getAttribute('aria-current')).toBe('page')
  })

  it('renders non-last items as links', () => {
    render(
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Topics', path: '/topics' },
          { name: 'Current', path: '/current' },
        ]}
      />,
    )
    const homeLink = screen.getByText('Home').closest('a')
    expect(homeLink?.getAttribute('href')).toBe('/')
    const topicsLink = screen.getByText('Topics').closest('a')
    expect(topicsLink?.getAttribute('href')).toBe('/topics')
  })

  it('derives data-pw values from stable paths instead of display names', () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { name: 'Accueil', path: '/' },
          { name: 'Localized Product Details', path: '/products/item' },
        ]}
      />,
    )

    expect(container.querySelector('[data-pw="breadcrumb-link-home"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="breadcrumb-current-products-item"]')).not.toBeNull()
    expect(
      container.querySelector('[data-pw="breadcrumb-current-localized-product-details"]'),
    ).toBeNull()
  })

  it('does not produce duplicate keys when items share the same path', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <Breadcrumbs
        items={[
          { name: 'Admin', path: '/admin' },
          { name: 'Topics', path: '/topics/create' },
          { name: 'Create', path: '/topics/create' },
        ]}
      />,
    )

    const keyWarnings = consoleSpy.mock.calls.filter(
      args => typeof args[0] === 'string' && args[0].includes('same key'),
    )
    expect(keyWarnings).toHaveLength(0)

    expect(screen.getByText('Topics')).toBeInTheDocument()
    expect(screen.getByText('Create')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})
