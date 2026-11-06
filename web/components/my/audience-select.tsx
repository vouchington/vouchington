'use client'

// oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Privacy form call sites pass literal test IDs through this shared select.
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UserPrivacyAudience } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

const AUDIENCE_OPTIONS: UserPrivacyAudience[] = [
  'everyone',
  'users',
  'followers',
  'mutual_followers',
  'nobody',
]

export function AudienceSelect({
  dataPw,
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: UserPrivacyAudience
  onChange: (v: UserPrivacyAudience) => void
  disabled?: boolean
  dataPw?: {
    trigger?: string
    options?: Partial<Record<UserPrivacyAudience, string>>
  }
}) {
  const t = useTranslations()
  const audienceLabels: Record<UserPrivacyAudience, string> = {
    everyone: t('extracted.my.audienceSelect.everyone_da2e5dc5'),
    users: t('extracted.my.audienceSelect.loggedInUsers_81dac12b'),
    followers: t('extracted.my.audienceSelect.followers_a145ab34'),
    mutual_followers: t('extracted.my.audienceSelect.mutualFollowers_d9be0db7'),
    nobody: t('extracted.my.audienceSelect.nobody_3fad99b5'),
  }
  const triggerTestId = dataPw?.trigger

  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        onValueChange={v => onChange(v as UserPrivacyAudience)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className='w-48'
          data-pw={triggerTestId}
        >
          <SelectValue placeholder={t('extracted.my.audienceSelect.selectAudience_e2815050')} />
        </SelectTrigger>
        <SelectContent>
          {AUDIENCE_OPTIONS.map(opt => {
            const optionTestId = dataPw?.options?.[opt]

            return (
              <SelectItem
                key={opt}
                value={opt}
                data-pw={optionTestId}
              >
                {audienceLabels[opt]}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>
    </div>
  )
}
