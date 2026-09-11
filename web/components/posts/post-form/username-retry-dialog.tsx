import { UsernameRequiredDialog } from '@/components/shared/username-required-dialog'

export function UsernameRetryDialog({
  onClose,
  onUsernameSet,
  open,
}: {
  onClose: () => void
  onUsernameSet: () => Promise<void>
  open: boolean
}) {
  return (
    <UsernameRequiredDialog
      open={open}
      onUsernameSet={onUsernameSet}
      onClose={onClose}
    />
  )
}
