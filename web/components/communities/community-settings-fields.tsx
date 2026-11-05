'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CommunitySettingsFormState } from './use-community-settings-form'
import { useRef } from 'react'
import { SlugAvailability } from '@/components/shared/slug-availability'
import { useAvailabilityCheck } from '@/hooks/use-availability-check'
import { useTranslations } from '@/lib/i18n/use-translations'
import { CommunitySettingsPolicyFields } from './community-settings-policy-fields'

type CommunitySettingsFieldsProps = Pick<
  CommunitySettingsFormState,
  | 'allowMemberInvites'
  | 'listType'
  | 'markdown'
  | 'memberRosterVisibility'
  | 'name'
  | 'requiresPostApproval'
  | 'setAllowMemberInvites'
  | 'setListType'
  | 'setMarkdown'
  | 'setMemberRosterVisibility'
  | 'setName'
  | 'setRequiresPostApproval'
  | 'setSlug'
  | 'setVisibility'
  | 'slug'
  | 'visibility'
>

export function CommunitySettingsFields(props: CommunitySettingsFieldsProps) {
  const t = useTranslations()
  const initialSlugRef = useRef(props.slug)
  const slugAvailability = useAvailabilityCheck('community-slug')

  return (
    <>
      <div className='space-y-2'>
        <Label htmlFor='name'>
          {t('extracted.communities.communitySettingsFields.communityName_f7e0dd3f')}
        </Label>
        <Input
          id='name'
          value={props.name}
          onChange={e => props.setName(e.target.value)}
          placeholder={t('extracted.communities.communitySettingsFields.communityName_0565934a')}
          required
          data-pw='community-settings-name-input'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='slug'>
          {t('extracted.communities.communitySettingsFields.slug_d15387ec')}
        </Label>
        <Input
          id='slug'
          value={props.slug}
          onChange={e => {
            props.setSlug(e.target.value)
            slugAvailability.reset()
          }}
          onBlur={() => {
            if (props.slug !== initialSlugRef.current) slugAvailability.onBlur(props.slug)
          }}
          placeholder={t('extracted.communities.communitySettingsFields.communitySlug_62aa4f50')}
          required
          data-pw='community-settings-slug-input'
        />
        <SlugAvailability
          kind='community-slug'
          state={slugAvailability.state}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='markdown'>
          {t('extracted.communities.communitySettingsFields.description_526e0087')}
        </Label>
        <Textarea
          id='markdown'
          value={props.markdown}
          onChange={e => props.setMarkdown(e.target.value)}
          rows={4}
          placeholder={t(
            'extracted.communities.communitySettingsFields.describeThisCommunity_a4a76f44',
          )}
        />
      </div>

      <CommunitySettingsPolicyFields {...props} />
    </>
  )
}
