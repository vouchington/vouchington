import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { expectTextareaCmdEnterSubmits } from '@/test-helpers/form-keyboard'
import { ChatInput } from '../chat-input'

const defaultProps = {
  onSend: vi.fn<VitestLooseMock>(),
  isStreaming: false,
  onAbort: vi.fn<VitestLooseMock>(),
}

describe('ChatInput', () => {
  it('renders textarea and send button', () => {
    const { container } = render(<ChatInput {...defaultProps} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toContainElement(
      container.querySelector('[data-icon="send-chat-message"]'),
    )
  })

  it('calls onSend with trimmed value on Cmd+Enter', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '  hello  ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSend).toHaveBeenCalledWith('hello')
  })

  it('calls onSend with trimmed value on Ctrl+Enter', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'world' } })
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(onSend).toHaveBeenCalledWith('world')
  })

  it('clears textarea value after sending via Cmd+Enter', () => {
    render(<ChatInput {...defaultProps} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'test message' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(textarea.value).toBe('')
  })

  it('calls onSend when send button is clicked', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'click test' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))
    expect(onSend).toHaveBeenCalledWith('click test')
  })

  it('does not submit on plain Enter (newline preserved)', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not call onSend for whitespace-only value', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not call onSend when disabled', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
        disabled
      />,
    )
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not call onSend when streaming', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
        isStreaming
      />,
    )
    // During streaming the send button is replaced by stop; Cmd+Enter is still a no-op
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('follows the textarea Cmd/Ctrl+Enter form-keyboard convention', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    // ChatInput clears the textarea after each submit; setup refills it so each keydown has content.
    expectTextareaCmdEnterSubmits({
      textarea,
      onSubmit: onSend,
      setup: () => fireEvent.change(textarea, { target: { value: 'message' } }),
    })
  })

  it('shows stop button and calls onAbort when streaming', () => {
    const onAbort = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onAbort={onAbort}
        isStreaming
      />,
    )
    expect(screen.getByRole('button', { name: /stop generating/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /stop generating/i }))
    expect(onAbort).toHaveBeenCalledOnce()
  })

  it('form submit always calls preventDefault — page reload guard', () => {
    const onSend = vi.fn<VitestLooseMock>()
    render(
      <ChatInput
        {...defaultProps}
        onSend={onSend}
      />,
    )

    const form = screen.getByRole('textbox').closest('form')!
    let capturedDefaultPrevented = false

    // Register at document level — fires AFTER React's root-level delegation has called
    // our onSubmit handler (which calls e.preventDefault()), so defaultPrevented is already true.
    const listener = (e: Event) => {
      capturedDefaultPrevented = e.defaultPrevented
    }
    document.addEventListener('submit', listener)

    try {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'reload guard' } })
      fireEvent.submit(form)

      expect(capturedDefaultPrevented).toBe(true)
      expect(onSend).toHaveBeenCalledWith('reload guard')
    } finally {
      document.removeEventListener('submit', listener)
    }
  })
})
