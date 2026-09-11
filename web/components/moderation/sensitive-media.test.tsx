import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SensitiveMedia } from './sensitive-media'

describe('SensitiveMedia', () => {
  it('shows blur gate with reveal button before interaction', () => {
    render(
      <SensitiveMedia>
        <span>image placeholder</span>
      </SensitiveMedia>,
    )
    expect(screen.getByText('Sensitive content')).toBeInTheDocument()
    expect(screen.getByText('Click to reveal')).toBeInTheDocument()
  })

  it('reveals content and fires onReveal when button clicked', () => {
    const onReveal = vi.fn<() => void>()
    render(
      <SensitiveMedia onReveal={onReveal}>
        <span data-testid='media-child'>inner</span>
      </SensitiveMedia>,
    )

    fireEvent.click(screen.getByRole('button'))

    expect(onReveal).toHaveBeenCalledOnce()
    expect(screen.queryByText('Sensitive content')).not.toBeInTheDocument()
    expect(screen.getByTestId('media-child')).toBeInTheDocument()
  })

  it('reveals without crashing when onReveal is omitted', () => {
    render(
      <SensitiveMedia>
        <span>content</span>
      </SensitiveMedia>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.queryByText('Sensitive content')).not.toBeInTheDocument()
  })

  it('keeps sensitive media hidden when reveals are disabled', () => {
    const onReveal = vi.fn<() => void>()
    render(
      <SensitiveMedia
        disabled
        onReveal={onReveal}
      >
        <span>content</span>
      </SensitiveMedia>,
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onReveal).not.toHaveBeenCalled()
    expect(screen.getByText('Sensitive content')).toBeInTheDocument()
  })

  it('keeps interactive descendants inert until the reveal is accepted', () => {
    const onActivate = vi.fn<() => void>()
    const media = (
      <button
        type='button'
        onClick={onActivate}
      >
        Open media
      </button>
    )
    const { container, rerender } = render(<SensitiveMedia disabled>{media}</SensitiveMedia>)

    const mediaButton = screen.getByText('Open media')
    const gatedContent = container.querySelector('[inert]')

    expect(gatedContent).toContainElement(mediaButton)
    expect(gatedContent).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: 'Open media' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sensitive content/i })).toBeDisabled()
    expect(onActivate).not.toHaveBeenCalled()

    rerender(<SensitiveMedia>{media}</SensitiveMedia>)
    fireEvent.click(screen.getByRole('button', { name: /Sensitive content/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Open media' }))

    expect(onActivate).toHaveBeenCalledOnce()
  })
})
