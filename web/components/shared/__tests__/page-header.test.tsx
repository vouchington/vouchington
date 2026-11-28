import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from '../page-header'

describe('PageHeader', () => {
  it('renders the title in an h1', () => {
    render(<PageHeader title='Stories' />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Stories')
  })

  it('renders the description when provided', () => {
    render(
      <PageHeader
        title='Stories'
        description='Read community stories.'
      />,
    )
    expect(screen.getByText('Read community stories.')).toBeInTheDocument()
  })

  it('does not render a description element when description is omitted', () => {
    render(<PageHeader title='Stories' />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.nextSibling).toBeNull()
  })

  it('defaults the title data-pw to page-header-title', () => {
    render(<PageHeader title='Stories' />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'data-pw',
      'page-header-title',
    )
  })

  it('allows pages to preserve a stable title data-pw selector', () => {
    render(
      <PageHeader
        title='Stories'
        dataPw='stories-page-heading'
      />,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute(
      'data-pw',
      'stories-page-heading',
    )
  })
})
