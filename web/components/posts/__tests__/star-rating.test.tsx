import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StarRating } from '../star-rating'

describe('StarRating', () => {
  it('renders five radio inputs with the selected rating checked', () => {
    render(
      <StarRating
        rating={3}
        onChange={vi.fn<(rating: number) => void>()}
      />,
    )

    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(radios[2]).toBeChecked()
    expect(radios[0]).not.toBeChecked()
  })

  it('supports arrow key navigation for a11y semantics', () => {
    const onChange = vi.fn<(rating: number) => void>()
    render(
      <StarRating
        rating={3}
        onChange={onChange}
      />,
    )

    const radios = screen.getAllByRole('radio')
    radios[2]!.focus()

    fireEvent.keyDown(radios[2]!, {
      key: 'ArrowRight',
    })
    expect(onChange).toHaveBeenCalledWith(4)
    expect(radios[3]).toHaveFocus()
  })

  it('adds an accessible group label', () => {
    render(
      <StarRating
        rating={4}
        onChange={vi.fn<(rating: number) => void>()}
        label='Foobar'
      />,
    )

    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Rating for Foobar')
  })
})
