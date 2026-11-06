'use client'

// oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Post default call sites pass literal test IDs through this shared select.
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'

interface PostDefaultOption {
  label: string
  value: string
}

export function PostDefaultSelect({
  disabled,
  dataPw,
  id,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean
  dataPw?: {
    trigger?: string
    options?: Record<string, string>
  }
  id: string
  label: string
  onChange: (value: string) => void
  options: readonly PostDefaultOption[]
  value: string
}) {
  const t = useTranslations()
  const triggerTestId = dataPw?.trigger

  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className='w-48'
          data-pw={triggerTestId}
        >
          <SelectValue
            placeholder={t('extracted.privacyForm.postDefaultSelect.selectPrivacySetting_4587a12c')}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => {
            const optionTestId = dataPw?.options?.[o.value]

            return (
              <SelectItem
                key={o.value}
                value={o.value}
                data-pw={optionTestId}
              >
                {o.label}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
