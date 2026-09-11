/* oxlint-disable no-mistakes/playwright-literals -- Static day rows derive stable data-pw values from a local constant table. */
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const DAYS_OF_WEEK = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
] as const

export function DaysField({
  disabled,
  selectedDays,
  onDayToggle,
}: {
  disabled: boolean
  selectedDays: number[]
  onDayToggle: (day: number, checked: boolean) => void
}) {
  return (
    <div className='space-y-2'>
      <Label>Days</Label>
      <div className='flex flex-wrap gap-3'>
        {DAYS_OF_WEEK.map(day => {
          const selected = selectedDays.includes(day.value)
          return (
            <Label
              key={day.value}
              className='flex items-center gap-2 text-sm'
            >
              <Checkbox
                checked={selected}
                disabled={disabled || (selected && selectedDays.length === 1)}
                data-pw={`moderation-email-day-${day.value}`}
                onCheckedChange={checked => onDayToggle(day.value, checked === true)}
              />
              {day.label}
            </Label>
          )
        })}
      </div>
    </div>
  )
}
