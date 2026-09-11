import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'

function renderInForm(extra?: Parameters<typeof Textarea>[0]) {
  const onSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
  render(
    <form onSubmit={onSubmit}>
      <Textarea
        aria-label='Body'
        {...extra}
      />
      <button type='submit'>Submit</button>
    </form>,
  )
  return { onSubmit, textarea: screen.getByLabelText('Body') as HTMLTextAreaElement }
}

describe('Textarea (auto submit-on-cmd-enter)', () => {
  it('submits the surrounding form on Meta+Enter', () => {
    const { onSubmit, textarea } = renderInForm()
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('submits the surrounding form on Ctrl+Enter', () => {
    const { onSubmit, textarea } = renderInForm()
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('does not submit on plain Enter (newline only)', () => {
    const { onSubmit, textarea } = renderInForm()
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on Shift+Meta+Enter', () => {
    const { onSubmit, textarea } = renderInForm()
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true, shiftKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on Alt+Meta+Enter', () => {
    const { onSubmit, textarea } = renderInForm()
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true, altKey: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit during IME composition', () => {
    const { onSubmit, textarea } = renderInForm()
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true, isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('runs caller onKeyDown before the default and lets it opt out via preventDefault', () => {
    const onSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    const onKeyDown = vi.fn<VitestLooseMock>((e: KeyboardEvent<HTMLTextAreaElement>) =>
      e.preventDefault(),
    )
    render(
      <form onSubmit={onSubmit}>
        <Textarea
          aria-label='Body'
          onKeyDown={onKeyDown}
        />
        <button type='submit'>Submit</button>
      </form>,
    )
    fireEvent.keyDown(screen.getByLabelText('Body'), { key: 'Enter', metaKey: true })
    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('still calls caller onKeyDown when not opting out, and submits via the default', () => {
    const onSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    const onKeyDown = vi.fn<VitestLooseMock>()
    render(
      <form onSubmit={onSubmit}>
        <Textarea
          aria-label='Body'
          onKeyDown={onKeyDown}
        />
        <button type='submit'>Submit</button>
      </form>,
    )
    fireEvent.keyDown(screen.getByLabelText('Body'), { key: 'Enter', metaKey: true })
    expect(onKeyDown).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('does not throw when textarea is not inside a form', () => {
    render(<Textarea aria-label='Body' />)
    expect(() =>
      fireEvent.keyDown(screen.getByLabelText('Body'), { key: 'Enter', metaKey: true }),
    ).not.toThrow()
  })
})
