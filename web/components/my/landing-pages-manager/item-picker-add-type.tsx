'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LandingPageAddType } from './options'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AddTypeSelect({
  addType,
  onAddTypeChange,
}: {
  addType: LandingPageAddType
  onAddTypeChange: (value: LandingPageAddType) => void
}) {
  const t = useTranslations()
  return (
    <div className='space-y-1'>
      <Label htmlFor='add-type'>
        {t('extracted.landingPagesManager.itemPickerAddType.addItemType_dc0a53b2')}
      </Label>
      <Select
        value={addType}
        onValueChange={value => onAddTypeChange(value as LandingPageAddType)}
      >
        <SelectTrigger
          id='add-type'
          data-pw='landing-page-add-type-select'
        >
          <SelectValue
            placeholder={t('extracted.landingPagesManager.itemPickerAddType.selectType_b777140e')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='link'>
            {t('extracted.landingPagesManager.itemPickerAddType.link_a6a32dbc')}
          </SelectItem>
          <SelectItem value='profile_link'>
            {t('extracted.landingPagesManager.itemPickerAddType.profileLink_bdb5518e')}
          </SelectItem>
          <SelectItem value='review'>
            {t('extracted.landingPagesManager.itemPickerAddType.review_aff0766a')}
          </SelectItem>
          <SelectItem value='referral_link'>
            {t('extracted.landingPagesManager.itemPickerAddType.referralLink_441c6d0e')}
          </SelectItem>
          <SelectItem value='topic_group'>
            {t('extracted.landingPagesManager.itemPickerAddType.topicGroup_dfa81373')}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export function LinkFields({
  linkLabel,
  linkUrl,
  setLinkLabel,
  setLinkUrl,
}: {
  linkLabel: string
  linkUrl: string
  setLinkLabel: (value: string) => void
  setLinkUrl: (value: string) => void
}) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <div className='space-y-1'>
        <Label htmlFor='link-label'>
          {t('extracted.landingPagesManager.itemPickerAddType.label_0e66373f')}
        </Label>
        <Input
          id='link-label'
          value={linkLabel}
          onChange={event => setLinkLabel(event.target.value)}
          placeholder={t('extracted.landingPagesManager.itemPickerAddType.buttonText_ec208ead')}
          maxLength={100}
          data-pw='landing-page-add-link-label'
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor='link-url'>
          {t('extracted.landingPagesManager.itemPickerAddType.url_e7a241de')}
        </Label>
        <Input
          id='link-url'
          type='url'
          value={linkUrl}
          onChange={event => setLinkUrl(event.target.value)}
          placeholder={t(
            'extracted.landingPagesManager.itemPickerAddType.httpsExampleCom_100680ad',
          )}
          maxLength={2048}
          data-pw='landing-page-add-link-url'
        />
      </div>
    </div>
  )
}
