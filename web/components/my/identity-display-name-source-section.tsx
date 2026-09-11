'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UseDisplayNameFrom } from '@/types/my'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialUsername: string | null
  initialFacebookAccount: { id: string } | null
  useDisplayNameFrom: UseDisplayNameFrom
  displayNameLoading: boolean
  onDisplayNameSourceChange: (value: string) => void
}

export function IdentityDisplayNameSourceSection({
  initialUsername,
  initialFacebookAccount,
  useDisplayNameFrom,
  displayNameLoading,
  onDisplayNameSourceChange,
}: Props) {
  const t = useTranslations()
  return (
    <div>
      <h2
        className='text-lg font-semibold'
        data-pw='identity-display-name-source-heading'
      >
        {t('extracted.my.identityDisplayNameSourceSection.displayNameSource_ed4b784e')}
      </h2>
      <div className='mt-3 space-y-2'>
        <Label htmlFor='use-display-name-from'>
          {t('extracted.my.identityDisplayNameSourceSection.showDisplayNameFrom_37aecb23')}
        </Label>
        <Select
          value={useDisplayNameFrom}
          onValueChange={onDisplayNameSourceChange}
          disabled={displayNameLoading}
        >
          <SelectTrigger
            id='use-display-name-from'
            className='w-48'
            data-pw='identity-display-name-source-trigger'
          >
            <SelectValue
              placeholder={t(
                'extracted.my.identityDisplayNameSourceSection.selectDisplayNameSource_f5561e1f',
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              value='username'
              disabled={!initialUsername}
            >
              {t('extracted.my.identityDisplayNameSourceSection.username_e3b89e9d')}
            </SelectItem>
            <SelectItem
              value='facebook'
              disabled={!initialFacebookAccount}
              data-pw='identity-display-name-source-option-facebook'
            >
              {t('extracted.my.identityDisplayNameSourceSection.facebook_d41f5b49')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
