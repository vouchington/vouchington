import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TooltipButton } from '../_button-tooltip'
import { Button } from '../button'

describe('Button', () => {
  it('renders responsive touch-safe size variants', () => {
    render(
      <>
        <Button size='touch'>Touch</Button>
        <Button size='touchSm'>Touch small</Button>
        <Button
          size='touchIcon'
          aria-label='Touch icon'
        />
      </>,
    )

    expect(screen.getByRole('button', { name: 'Touch' })).toHaveClass('h-11', 'sm:h-8')
    expect(screen.getByRole('button', { name: 'Touch small' })).toHaveClass('h-11', 'sm:h-7')
    expect(screen.getByRole('button', { name: 'Touch icon' })).toHaveClass(
      'h-11',
      'w-11',
      'sm:h-8',
      'sm:w-8',
    )
  })

  it('renders without tooltip wrapper when tooltip prop is omitted', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button).toBeInTheDocument()
    // No data-state attribute means no TooltipTrigger wrapping
    expect(button).not.toHaveAttribute('data-state')
  })

  it('wraps button in TooltipTrigger when tooltip prop is provided', () => {
    render(
      <TooltipButton
        size='icon'
        aria-label='Settings'
        tooltip='Settings'
      />,
    )
    const button = screen.getByRole('button', { name: 'Settings' })
    // TooltipTrigger sets data-state on its child
    expect(button).toHaveAttribute('data-state')
  })

  it('wraps button with TooltipTrigger for any tooltip node type', () => {
    const { rerender } = render(
      <TooltipButton
        size='icon'
        aria-label='Delete'
        tooltip='Delete item'
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-state', 'closed')

    rerender(
      <TooltipButton
        size='icon'
        aria-label='Delete'
        tooltip={<span>Rich tooltip</span>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-state', 'closed')
  })

  it('renders a spinner and sets aria-busy and disabled when loading', () => {
    render(<Button loading>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    // Loader2 svg is present
    expect(button.querySelector('svg')).toBeInTheDocument()
  })

  it('keeps children visible alongside the spinner when loading', () => {
    render(<Button loading>Saving...</Button>)
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeInTheDocument()
  })

  it('respects an additional disabled gate independently of loading', () => {
    render(
      <Button
        loading={false}
        disabled
      >
        Save
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('does not render a spinner and does not set aria-busy when not loading', () => {
    render(<Button>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).not.toHaveAttribute('aria-busy')
    expect(button.querySelector('svg')).not.toBeInTheDocument()
  })

  it('ignores loading when asChild is set (Slot requires single child)', () => {
    render(
      <Button
        asChild
        loading
      >
        <a href='/'>Home page</a>
      </Button>,
    )
    const link = screen.getByRole('link', { name: 'Home page' })
    // No extra spinner child injected — only the <a> is inside the Slot
    expect(link.querySelector('svg')).not.toBeInTheDocument()
    // aria-busy not set on asChild path
    expect(link).not.toHaveAttribute('aria-busy')
  })
})
