import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export function ModeratorVacationDurationControl({
  duration,
  disabled,
  label,
  options,
  onChange,
}: {
  duration: string
  disabled: boolean
  label: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className='ml-14 space-y-1'>
      <Label htmlFor='mod-vacation-duration'>{label}</Label>
      <Select
        value={duration}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id='mod-vacation-duration'
          className='w-48'
          data-pw='mod-vacation-duration'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ModeratorVacationDigestToggle({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  label: string
  description: string
  onChange: (value: boolean) => void
}) {
  return (
    <div className='flex items-start gap-4'>
      <Switch
        id='mod-vacation-suppress-digests'
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      <div className='space-y-1'>
        <Label htmlFor='mod-vacation-suppress-digests'>{label}</Label>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
    </div>
  )
}
