'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DataPw } from '@/components/shared/data-pw'

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
        <DataPw
          dataPw={triggerTestId}
          as={SelectTrigger}
          id={id}
          className='w-48'
        >
          <SelectValue
            placeholder={t('extracted.privacyForm.postDefaultSelect.selectPrivacySetting_4587a12c')}
          />
        </DataPw>
        <SelectContent>
          {options.map(o => {
            const optionTestId = dataPw?.options?.[o.value]

            return (
              <DataPw
                key={o.value}
                dataPw={optionTestId}
                as={SelectItem}
                value={o.value}
              >
                {o.label}
              </DataPw>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
