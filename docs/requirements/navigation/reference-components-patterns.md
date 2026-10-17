# UI Components reference

[Back to UI Components](COMPONENTS.md)

## Patterns

### Form Keyboard Behavior

Every form across the site supports the same submit shortcuts:

- **Plain `Enter` from a non-textarea input** submits the surrounding form. This is native HTML behaviour as long as the form contains a `<Button type='submit'>` (or a button with no explicit type).
- **`Cmd+Enter` or `Ctrl+Enter` from a `<Textarea>`** submits the surrounding form. Both modifiers are accepted on all platforms.
- **Plain `Enter` in a textarea** keeps inserting a newline. `Shift+Enter` and `Alt+Enter` likewise never submit.

Submission goes through `form.requestSubmit()`, so HTML5 validation and `react-hook-form` `handleSubmit` validation gates run as usual — invalid forms are not submitted.

Wiring is automatic at the design-system layer:

- The `<Textarea>` component (`web/components/ui/textarea.tsx`) auto-attaches the shared `submitOnCmdEnter` handler from `web/lib/form-submit.ts`. Callers do **not** add `onKeyDown={submitOnCmdEnter}` themselves. A caller-supplied `onKeyDown` runs first; calling `event.preventDefault()` opts out of the default submit.
- Every `<form>` must contain a `<Button type='submit'>` (or a button without an explicit `type`, which defaults to submit) so native Enter on inputs implicitly submits.

```tsx
<form onSubmit={handleSubmit}>
  <Input aria-label='Email' />
  <Textarea aria-label='Message' />
  <Button type='submit'>Send</Button>
</form>
```

Per-form vitest coverage uses the helpers in `web/test-helpers/form-keyboard.ts` (`expectInputEnterSubmits`, `expectTextareaCmdEnterSubmits`) so the rule stays regression-proof site-wide.

**Multi-step forms** — when the user completes one step and the next step's input appears, focus it automatically:

```tsx
// Always use [active] with an if-guard — returning null when inactive does NOT
// unmount the component, so [] deps would only run once at initial mount.
// Use [] only when the parent truly conditionally mounts: {active && <Step/>}.
const inputRef = useRef<HTMLInputElement>(null)
useEffect(() => {
  if (active) inputRef.current?.focus()
}, [active])
```

Reference implementation: `web/components/auth/login-email-step.tsx`, `web/components/auth/login-code-step.tsx`, `web/components/auth/mfa-step.tsx`.

See [web-agent-rules.md](../../development/web-agent-rules.md#forms-auth-and-errors) for the authoritative rule.
