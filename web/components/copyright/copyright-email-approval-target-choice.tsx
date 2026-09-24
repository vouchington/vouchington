import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'

export function CopyrightEmailApprovalTargetChoice({
  checked,
  choice,
  disabled,
  index,
  onCheckedChange,
  targetId,
}: {
  checked: boolean
  choice: CopyrightNoticeResolvedTarget
  disabled: boolean
  index: number
  onCheckedChange: (checked: boolean) => void
  targetId: string
}) {
  const id = `copyright-email-target-${targetId}-${choice.image_id}`
  const label = choice.caption.trim() || `Image ${choice.order_index + 1}`
  return (
    <Label
      className='flex items-center gap-2 text-sm'
      htmlFor={id}
    >
      <Checkbox
        aria-label={`Hosted image ${index + 1}: ${label}`}
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={checked => onCheckedChange(checked === true)}
      />
      {label}
    </Label>
  )
}
