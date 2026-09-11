import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatLayout } from '../chat-layout'

describe('ChatLayout', () => {
  it('renders messages and input slots', () => {
    render(
      <ChatLayout>
        <div>messages slot</div>
        <div>input slot</div>
      </ChatLayout>,
    )
    expect(screen.getByText('messages slot')).toBeInTheDocument()
    expect(screen.getByText('input slot')).toBeInTheDocument()
  })

  it('applies max-w-3xl and mx-auto for horizontal centering', () => {
    const { container } = render(
      <ChatLayout>
        <div />
        <div />
      </ChatLayout>,
    )
    const outer = container.firstElementChild as HTMLElement
    expect(outer.className).toContain('max-w-3xl')
    expect(outer.className).toContain('mx-auto')
  })

  it('throws a clear error when exactly two slots are not provided', () => {
    expect(() =>
      render(
        <ChatLayout>
          <div>messages only</div>
        </ChatLayout>,
      ),
    ).toThrow('ChatLayout requires exactly two children: messages and input.')
  })
})
