import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThirdPartyText } from '../third-party-text'

describe('ThirdPartyText', () => {
  it('sets dir auto and omits lang on the requested element', () => {
    render(
      <ThirdPartyText
        as='p'
        className='summary'
        text='نص من خدمة أخرى'
      />,
    )

    const text = screen.getByText('نص من خدمة أخرى')
    expect(text.tagName).toBe('P')
    expect(text).toHaveClass('summary')
    expect(text).toHaveAttribute('dir', 'auto')
    expect(text).not.toHaveAttribute('lang')
  })
})
