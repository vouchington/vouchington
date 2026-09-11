import type { KeyboardEvent } from 'react'

/**
 * Submit the closest <form> when the user presses Cmd+Enter or Ctrl+Enter inside a
 * textarea. Both modifiers are accepted on all platforms. Plain Enter still inserts a newline.
 *
 * Uses requestSubmit() so the form's onSubmit handler and native HTML5 validation run.
 * requestSubmit() does not check the submit button's disabled state — forms that enforce
 * preconditions via a disabled button must also guard the same preconditions inside
 * handleSubmit (e.g. `if (loading) return`) or via react-hook-form validation rules.
 *
 * The shared <Textarea> component (web/components/ui/textarea.tsx) already wires
 * this handler by default (composed with any caller-provided onKeyDown), so direct
 * use is rarely needed. Plain inputs rely on native HTML form Enter submission via
 * a <Button type='submit'>.
 */
export function submitOnCmdEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== 'Enter') return
  if (!(event.metaKey || event.ctrlKey)) return
  if (event.shiftKey || event.altKey) return
  if (event.nativeEvent.isComposing) return
  const form = event.currentTarget.form
  if (!form) return
  event.preventDefault()
  form.requestSubmit()
}
