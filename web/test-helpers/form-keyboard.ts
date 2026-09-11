import { fireEvent, waitFor } from '@testing-library/react'
import { expect, type Mock } from 'vitest'

/**
 * Site-wide form-submit keyboard convention helpers.
 *
 * - Plain Enter on a non-textarea input submits the surrounding form (native HTML).
 * - Cmd+Enter or Ctrl+Enter on a Textarea submits the surrounding form
 *   (wired by default in `web/components/ui/textarea.tsx`).
 * - Plain Enter on a Textarea inserts a newline; it must not submit.
 *
 * Each form vitest test should call the relevant helpers so the rule stays
 * regression-proof site-wide.
 *
 * Spec: docs/requirements/navigation/reference-components-patterns.md#form-keyboard-behavior
 */

// Wide enough to accept any vi.fn() including narrowly-typed mocks like
// `Mock<(addr: string) => Promise<void>>`. Function-parameter contravariance means
// a `Mock<(...args: unknown[]) => unknown>` cannot accept those without a cast.
type SubmitSpy = Mock<(...args: any[]) => any>

/**
 * Assert pressing Enter on a non-textarea input submits the form.
 *
 * Uses native form `submit` dispatch (the same path the browser uses when the
 * user presses Enter and a `<button type='submit'>` is present), so we don't
 * have to reproduce HTMLFormElement.requestSubmit's submitter-resolution rules
 * inside jsdom.
 */
export function expectInputEnterSubmits({
  input,
  onSubmit,
  awaitSubmit = false,
}: {
  input: HTMLInputElement
  onSubmit: SubmitSpy
  // Set for forms whose submit handler is async before it calls `onSubmit` (e.g. forms that mint a
  // reCAPTCHA token at submit time). Returns a Promise that resolves once `onSubmit` is called.
  awaitSubmit?: boolean
}): void | Promise<void> {
  const form = input.form
  if (!form) throw new Error('expectInputEnterSubmits: input is not inside a <form>')
  // Check both inline and externally-associated submit controls (via `form=` attribute).
  const hasSubmitControl =
    !!form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]') ||
    [...form.elements].some(el => {
      if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
        return el.type === 'submit'
      }
      return false
    })
  if (!hasSubmitControl)
    throw new Error(
      'expectInputEnterSubmits: form has no submit-capable control; add a <Button type="submit"> to enforce the site-wide convention',
    )
  onSubmit.mockClear()
  fireEvent.submit(form)
  if (awaitSubmit) return waitFor(() => expect(onSubmit).toHaveBeenCalled())
  expect(onSubmit).toHaveBeenCalled()
}

/**
 * Assert Cmd+Enter and Ctrl+Enter on a textarea submit the form, and that
 * plain Enter does not.
 *
 * Pass `setup` when the form clears its state after each submit (e.g. ChatInput).
 * It is called after `mockClear()` and before each keydown so the form is ready
 * to submit again (e.g. re-fill the textarea value).
 */
export function expectTextareaCmdEnterSubmits({
  textarea,
  onSubmit,
  setup,
}: {
  textarea: HTMLTextAreaElement
  onSubmit: SubmitSpy
  setup?: () => void
}) {
  const form = textarea.form
  if (!form) throw new Error('expectTextareaCmdEnterSubmits: textarea is not inside a <form>')

  onSubmit.mockClear()
  setup?.()
  fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
  expect(onSubmit).toHaveBeenCalled()

  onSubmit.mockClear()
  setup?.()
  fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
  expect(onSubmit).toHaveBeenCalled()

  onSubmit.mockClear()
  setup?.()
  fireEvent.keyDown(textarea, { key: 'Enter' })
  expect(onSubmit).not.toHaveBeenCalled()
}
