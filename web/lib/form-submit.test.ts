import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { submitOnCmdEnter } from './form-submit'

function TestForm({ onSubmit }: { onSubmit: (e: React.FormEvent) => void }) {
  return React.createElement(
    'form',
    { onSubmit },
    React.createElement('textarea', { onKeyDown: submitOnCmdEnter }),
  )
}

describe('submitOnCmdEnter', () => {
  it('submits form on Meta+Enter', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
    expect(handleSubmit).toHaveBeenCalledOnce()
  })

  it('submits form on Ctrl+Enter', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true })
    expect(handleSubmit).toHaveBeenCalledOnce()
  })

  it('does not submit on plain Enter', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on Shift+Enter', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true, shiftKey: true })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on Alt+Enter', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true, altKey: true })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on non-Enter key with Meta', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'k', metaKey: true })
    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('does not submit when textarea is not inside a form', () => {
    render(React.createElement('textarea', { onKeyDown: submitOnCmdEnter }))
    // event.currentTarget.form is null — must return early without throwing
    expect(() =>
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true }),
    ).not.toThrow()
  })

  it('does not submit during IME composition', () => {
    const handleSubmit = vi.fn<VitestLooseMock>((e: React.FormEvent) => e.preventDefault())
    render(React.createElement(TestForm, { onSubmit: handleSubmit }))
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      metaKey: true,
      isComposing: true,
    })
    expect(handleSubmit).not.toHaveBeenCalled()
  })
})
