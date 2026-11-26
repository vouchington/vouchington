/* oxlint-disable no-mistakes/playwright-consistent-attribute, no-mistakes/playwright-literals, no-mistakes/playwright-defaults, react/only-export-components -- moved test support keeps the data-testid selectors the username gate tests query and a local button stub */

import { vi } from 'vitest'

function UsernameDialogButton({
  testId,
  onClick,
  label,
}: {
  testId: string
  onClick: () => void
  label: string
}) {
  return (
    // ast-grep-ignore: web-no-raw-form-elements -- test double replaces the dialog actions with native buttons the tests click
    <button
      type='button'
      data-testid={testId}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

vi.mock(
  import('@/components/shared/username-required-dialog'),
  () =>
    ({
      UsernameRequiredDialog: ({
        open,
        onUsernameSet,
        onClose,
      }: {
        open: boolean
        onUsernameSet: () => void
        onClose: () => void
      }) =>
        open ? (
          <div data-testid='username-required-dialog-stub'>
            <UsernameDialogButton
              testId='username-dialog-set'
              onClick={onUsernameSet}
              label='Set username'
            />
            <UsernameDialogButton
              testId='username-dialog-close'
              onClick={onClose}
              label='Close'
            />
          </div>
        ) : null,
    }) as unknown as typeof import('@/components/shared/username-required-dialog'),
)
