import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThirdPartyText } from '../third-party-text'

describe('ThirdPartyText', () => {
  it('sets an empty lang and dir auto on the requested element under an English page', () => {
    render(
      <div lang='en'>
        <ThirdPartyText
          as='p'
          text='نص من خدمة أخرى'
        />
      </div>,
    )

    const text = screen.getByText('نص من خدمة أخرى')
    expect(text.tagName).toBe('P')
    expect(text).toHaveAttribute('dir', 'auto')
    expect(text).toHaveAttribute('lang', '')
  })
})
