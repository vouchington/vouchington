'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CommunityListType, CommunityMemberRosterVisibility } from '@/types/api-responses'
import type { CommunitySettingsFormState } from './use-community-settings-form'
import { useTranslations } from '@/lib/i18n/use-translations'

type CommunitySettingsPolicyFieldsProps = Pick<
  CommunitySettingsFormState,
  | 'allowMemberInvites'
  | 'listType'
  | 'memberRosterVisibility'
  | 'requiresPostApproval'
  | 'setAllowMemberInvites'
  | 'setListType'
  | 'setMemberRosterVisibility'
  | 'setRequiresPostApproval'
  | 'setVisibility'
  | 'visibility'
>

export function CommunitySettingsPolicyFields(props: CommunitySettingsPolicyFieldsProps) {
  const t = useTranslations()
  return (
    <>
      <div className='space-y-2'>
        <Label htmlFor='visibility'>
          {t('extracted.communities.communitySettingsFields.visibility_7448611d')}
        </Label>
        <Select
          value={props.visibility}
          onValueChange={v => props.setVisibility(v as 'public' | 'private')}
        >
          <SelectTrigger id='visibility'>
            <SelectValue
              placeholder={t(
                'extracted.communities.communitySettingsFields.selectVisibility_50cfa8c8',
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='public'>
              {t('extracted.communities.communitySettingsFields.publicAnyoneCanJoin_e148a075')}
            </SelectItem>
            <SelectItem value='private'>
              {t(
                'extracted.communities.communitySettingsFields.privateInviteOrApprovalRequired_3f4adbfa',
              )}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='list-type'>
          {t('extracted.communities.communitySettingsFields.canonicalListAction_6c559481')}
        </Label>
        <Select
          value={props.listType}
          onValueChange={v => props.setListType(v as 'none' | CommunityListType)}
        >
          <SelectTrigger id='list-type'>
            <SelectValue
              placeholder={t(
                'extracted.communities.communitySettingsFields.selectCanonicalListAction_8f79fb44',
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>
              {t('extracted.communities.communitySettingsFields.none_dc937b59')}
            </SelectItem>
            <SelectItem value='follow'>
              {t(
                'extracted.communities.communitySettingsFields.followListSubscribersVirtuallyFollowAll_ef6a626f',
              )}
            </SelectItem>
            <SelectItem value='mute'>
              {t(
                'extracted.communities.communitySettingsFields.muteListSubscribersVirtuallyMuteAll_367ce7a7',
              )}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          {t(
            'extracted.communities.communitySettingsFields.determinesWhichSingleListActionAppears_71227864',
          )}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='member-roster-visibility'>
          {t('extracted.communities.communitySettingsFields.memberRosterVisibility_e305162e')}
        </Label>
        <Select
          value={props.memberRosterVisibility}
          onValueChange={v => props.setMemberRosterVisibility(v as CommunityMemberRosterVisibility)}
        >
          <SelectTrigger
            id='member-roster-visibility'
            data-pw='community-settings-member-roster-visibility-select'
          >
            <SelectValue
              placeholder={t(
                'extracted.communities.communitySettingsFields.selectMemberRosterVisibility_11ae0282',
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='public'>
              {t('extracted.communities.communitySettingsFields.public_591935b1')}
            </SelectItem>
            <SelectItem value='users'>
              {t('extracted.communities.communitySettingsFields.signedInUsers_e9125a02')}
            </SelectItem>
            <SelectItem value='members'>
              {t('extracted.communities.communitySettingsFields.members_1044a4c0')}
            </SelectItem>
            <SelectItem
              value='moderators'
              data-pw='community-settings-member-roster-visibility-option-moderators'
            >
              {t(
                'extracted.communities.communitySettingsFields.ownersModeratorsAndAdmins_1a0c30a7',
              )}
            </SelectItem>
          </SelectContent>
        </Select>
        <p className='text-xs text-muted-foreground'>
          {t(
            'extracted.communities.communitySettingsFields.ownersAndModeratorsAreAlwaysShown_aac18b30',
          )}
        </p>
      </div>

      <CommunityOptionsFields {...props} />
    </>
  )
}

function CommunityOptionsFields(props: CommunitySettingsPolicyFieldsProps) {
  const t = useTranslations()
  return (
    <div className='space-y-3'>
      <Label>{t('extracted.communities.communitySettingsFields.options_d0db8b5e')}</Label>
      <div className='space-y-3'>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='requires-post-approval'
            checked={props.requiresPostApproval}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              props.setRequiresPostApproval(checked === true)
            }
          />
          <Label
            htmlFor='requires-post-approval'
            className='cursor-pointer font-normal'
          >
            {t(
              'extracted.communities.communitySettingsFields.requirePostApprovalBeforePublishing_20466412',
            )}
          </Label>
        </div>
        <div className='flex items-center gap-2'>
          <Checkbox
            id='allow-member-invites'
            checked={props.allowMemberInvites}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
              props.setAllowMemberInvites(checked === true)
            }
          />
          <Label
            htmlFor='allow-member-invites'
            className='cursor-pointer font-normal'
          >
            {t('extracted.communities.communitySettingsFields.allowMembersToInviteOthers_a4ec6be5')}
          </Label>
        </div>
      </div>
    </div>
  )
}
