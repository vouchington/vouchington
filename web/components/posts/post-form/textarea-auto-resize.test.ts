import { act, renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useTextareaAutoResize } from './textarea-auto-resize'

describe('useTextareaAutoResize', () => {
  it('returns a ref and is a no-op when no textarea is attached', () => {
    const { result, rerender } = renderHook(({ value }) => useTextareaAutoResize(value), {
      initialProps: { value: '' },
    })
    expect(result.current.current).toBeNull()
    // Re-running the effect with no attached element must not throw.
    expect(() => rerender({ value: 'changed' })).not.toThrow()
  })

  it('sets the textarea height to fit content on value change', () => {
    const textarea = document.createElement('textarea')
    Object.defineProperty(textarea, 'scrollHeight', { value: 120, configurable: true })

    const { result, rerender } = renderHook(({ value }) => useTextareaAutoResize(value), {
      initialProps: { value: 'hello' },
    })

    act(() => {
      result.current.current = textarea
    })
    rerender({ value: 'hello world' })

    expect(textarea.style.height).toBe('120px')
  })
})
