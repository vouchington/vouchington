'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SlugAvailability } from '@/components/shared/slug-availability'
import type { AvailabilityState } from '@/hooks/use-availability-check'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CreateCommunityDetailsFieldsProps {
  allowMemberInvites: boolean
  markdown: string
  name: string
  nameTooShort: boolean
  setAllowMemberInvites: (value: boolean) => void
  setMarkdown: (value: string) => void
  setName: (value: string) => void
  setSlug: (value: string) => void
  setVisibility: (value: 'public' | 'private') => void
  slug: string
  slugAvailability: {
    state: AvailabilityState
    onBlur: (value: string) => void
    reset: () => void
  }
  visibility: 'public' | 'private'
}

export function CreateCommunityDetailsFields({
  allowMemberInvites,
  markdown,
  name,
  nameTooShort,
  setAllowMemberInvites,
  setMarkdown,
  setName,
  setSlug,
  setVisibility,
  slug,
  slugAvailability,
  visibility,
}: CreateCommunityDetailsFieldsProps) {
  const t = useTranslations()
  return (
    <>
      <div className='space-y-2'>
        <Label htmlFor='name'>
          {t('extracted.communities.createCommunityForm.communityName_f7e0dd3f')}
        </Label>
        <Input
          id='name'
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('extracted.communities.createCommunityForm.myAwesomeCommunity_1ede3c3e')}
          required
          aria-invalid={nameTooShort ? 'true' : undefined}
          aria-describedby={nameTooShort ? 'create-community-name-error' : undefined}
          data-pw='create-community-name-input'
        />
        {nameTooShort && (
          <p
            id='create-community-name-error'
            role='alert'
            className='text-xs text-destructive'
            data-pw='create-community-name-error'
          >
            {t('extracted.communities.createCommunityForm.communityNameMustHaveAtLeast_f99bb432')}
          </p>
        )}
      </div>

      <div className='space-y-2'>
        <Label htmlFor='slug'>{t('extracted.communities.createCommunityForm.slug_d15387ec')}</Label>
        <Input
          id='slug'
          value={slug}
          onChange={e => {
            setSlug(e.target.value)
            slugAvailability.reset()
          }}
          onBlur={() => {
            if (slug) slugAvailability.onBlur(slug)
          }}
          placeholder={t('extracted.communities.createCommunityForm.myAwesomeCommunity_83104213')}
          data-pw='create-community-slug-input'
        />
        <p className='text-xs text-muted-foreground'>
          {t('extracted.communities.createCommunityForm.leaveBlankToAutoGenerateA_a525a32b')}
        </p>
        <SlugAvailability
          kind='community-slug'
          state={slugAvailability.state}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='markdown'>
          {t('extracted.communities.createCommunityForm.description_526e0087')}
        </Label>
        <Textarea
          id='markdown'
          value={markdown}
          onChange={e => setMarkdown(e.target.value)}
          placeholder={t(
            'extracted.communities.createCommunityForm.describeYourCommunity_39db0382',
          )}
          rows={4}
          data-pw='create-community-description-textarea'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='visibility'>
          {t('extracted.communities.createCommunityForm.visibility_7448611d')}
        </Label>
        <Select
          value={visibility}
          onValueChange={v => setVisibility(v as 'public' | 'private')}
        >
          <SelectTrigger id='visibility'>
            <SelectValue
              placeholder={t('extracted.communities.createCommunityForm.selectVisibility_50cfa8c8')}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='public'>
              {t('extracted.communities.createCommunityForm.publicAnyoneCanJoin_e148a075')}
            </SelectItem>
            <SelectItem value='private'>
              {t(
                'extracted.communities.createCommunityForm.privateInviteOrApprovalRequired_3f4adbfa',
              )}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-3'>
        <Label>{t('extracted.communities.createCommunityForm.options_d0db8b5e')}</Label>
        <div className='space-y-3'>
          <div className='flex items-center gap-2'>
            <Checkbox
              id='allow-member-invites'
              checked={allowMemberInvites}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                setAllowMemberInvites(checked === true)
              }
            />
            <Label
              htmlFor='allow-member-invites'
              className='cursor-pointer font-normal'
            >
              {t('extracted.communities.createCommunityForm.allowMembersToInviteOthers_a4ec6be5')}
            </Label>
          </div>
        </div>
      </div>
    </>
  )
}
