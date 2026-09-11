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
    expect(screen.getByText('Read community stories.')).toBeDefined()
  })

  it('does not render a description element when description is omitted', () => {
    render(<PageHeader title='Stories' />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.nextSibling).toBeNull()
  })

  it('applies custom titleClassName to the h1', () => {
    render(
      <PageHeader
        title='Stories'
        titleClassName='text-2xl'
      />,
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveClass('text-2xl')
    expect(h1).toHaveClass('font-bold')
    expect(h1).not.toHaveClass('sm:text-3xl')
  })

  it('uses responsive page title sizing', () => {
    render(<PageHeader title='Stories' />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveClass('text-2xl')
    expect(h1).toHaveClass('sm:text-3xl')
  })

  it('keeps responsive sizing when custom title classes do not set a base size', () => {
    render(
      <PageHeader
        title='Stories'
        titleClassName='tracking-tight'
      />,
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveClass('text-2xl')
    expect(h1).toHaveClass('sm:text-3xl')
    expect(h1).toHaveClass('tracking-tight')
  })

  it('keeps responsive sizing when custom title classes set only arbitrary color', () => {
    render(
      <PageHeader
        title='Stories'
        titleClassName='text-[#123456]'
      />,
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveClass('text-2xl')
    expect(h1).toHaveClass('sm:text-3xl')
    expect(h1).toHaveClass('text-[#123456]')
  })

  it('preserves custom title sizes with line-height modifiers', () => {
    const { rerender } = render(
      <PageHeader
        title='Stories'
        titleClassName='text-xl/7'
      />,
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveClass('text-xl/7')
    expect(h1).not.toHaveClass('sm:text-3xl')

    rerender(
      <PageHeader
        title='Stories'
        titleClassName='text-[24px]/8'
      />,
    )
    expect(h1).toHaveClass('text-[24px]/8')
    expect(h1).not.toHaveClass('sm:text-3xl')
  })

  it('description uses mt-1 and text-sm styles', () => {
    render(
      <PageHeader
        title='Stories'
        description='Subtitle text'
      />,
    )
    const p = screen.getByText('Subtitle text')
    expect(p.className).toContain('mt-1')
    expect(p.className).toContain('text-sm')
  })

  it('has data-pw page-header on the wrapper div', () => {
    const { container } = render(<PageHeader title='Stories' />)
    expect(container.firstElementChild?.getAttribute('data-pw')).toBe('page-header')
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
