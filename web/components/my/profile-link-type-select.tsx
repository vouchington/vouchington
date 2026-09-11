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
import type { ProfileLinkType } from '@/types/user'

function getSocialTypes(
  t: ReturnType<typeof useTranslations>,
): { value: ProfileLinkType; label: string }[] {
  return [
    { value: 'url', label: t('extracted.my.profileLinkTypeSelect.customUrl_bc5a014e') },
    { value: 'twitter', label: t('extracted.my.profileLinkTypeSelect.twitterX_3a409cda') },
    { value: 'github', label: t('extracted.my.profileLinkTypeSelect.github_f911e414') },
    { value: 'instagram', label: t('extracted.my.profileLinkTypeSelect.instagram_bad57ef7') },
    { value: 'linkedin', label: t('extracted.my.profileLinkTypeSelect.linkedin_dd84425b') },
    { value: 'youtube', label: t('extracted.my.profileLinkTypeSelect.youtube_fb7accff') },
    { value: 'facebook', label: t('extracted.my.profileLinkTypeSelect.facebook_d41f5b49') },
    { value: 'tiktok', label: t('extracted.my.profileLinkTypeSelect.tiktok_1bb6fcfb') },
  ]
}

interface ProfileLinkTypeSelectProps {
  value: ProfileLinkType
  onValueChange: (type: ProfileLinkType) => void
}

export function ProfileLinkTypeSelect({ value, onValueChange }: ProfileLinkTypeSelectProps) {
  const t = useTranslations()
  const socialTypes = getSocialTypes(t)

  return (
    <div className='space-y-1'>
      <Label htmlFor='link-type'>{t('extracted.my.profileLinkForm.linkType_3c93d388')}</Label>
      <Select
        value={value}
        onValueChange={v => onValueChange(v as ProfileLinkType)}
      >
        <SelectTrigger id='link-type'>
          <SelectValue placeholder={t('extracted.my.profileLinkForm.selectLinkType_22da2956')} />
        </SelectTrigger>
        <SelectContent>
          {socialTypes.map(option => (
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
