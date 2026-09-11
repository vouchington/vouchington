'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PostBroadcast, PostPrivacy } from '@/types/posts'
import { CONTENT_LANGUAGE_SELECT_OPTIONS } from '@ts-shared/languages/content-languages'
import { useTranslations } from '@/lib/i18n/use-translations'

const AUTO_DETECT_LANGUAGE = 'auto-detect'

export function AudienceField({
  broadcast,
  isCommunityPost,
  isPrivateCommunityPost,
  setBroadcast,
  setPrivacy,
}: {
  broadcast: PostBroadcast
  isCommunityPost: boolean
  isPrivateCommunityPost: boolean
  setBroadcast: (broadcast: PostBroadcast) => void
  setPrivacy: (privacy: PostPrivacy) => void
}) {
  const t = useTranslations()
  return (
    <fieldset className='space-y-2'>
      <legend
        id='post-audience-label'
        className='text-sm font-medium leading-none'
        data-pw='post-form-audience-label'
      >
        {t('extracted.postForm.advancedOptionsFields.audience_545c0235')}
      </legend>
      <Select
        value={broadcast}
        onValueChange={(value: PostBroadcast) => {
          setBroadcast(value)
          if (value === 'everyone') setPrivacy('public')
          if (isCommunityPost && value === 'users') setPrivacy('private')
        }}
      >
        <SelectTrigger
          aria-labelledby='post-audience-label'
          data-pw='post-form-audience-trigger'
        >
          <SelectValue
            placeholder={t('extracted.postForm.advancedOptionsFields.selectAudience_e2815050')}
          />
        </SelectTrigger>
        <SelectContent>
          {!isPrivateCommunityPost && (
            <SelectItem value='everyone'>
              {t('extracted.postForm.advancedOptionsFields.everyone_da2e5dc5')}
            </SelectItem>
          )}
          <SelectItem
            value='users'
            data-pw='post-form-audience-users'
          >
            {t('extracted.postForm.advancedOptionsFields.users_6b0cc904')}
          </SelectItem>
          {!isCommunityPost && (
            <>
              <SelectItem
                value='followers'
                data-pw='post-form-audience-followers'
              >
                {t('extracted.postForm.advancedOptionsFields.followers_a145ab34')}
              </SelectItem>
              <SelectItem value='mutual_followers'>
                {t('extracted.postForm.advancedOptionsFields.mutualFollowers_d9be0db7')}
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
    </fieldset>
  )
}

export function VisibilityField({
  isCommunityPost,
  privacy,
  setPrivacy,
}: {
  isCommunityPost: boolean
  privacy: PostPrivacy
  setPrivacy: (privacy: PostPrivacy) => void
}) {
  const t = useTranslations()
  return (
    <fieldset className='space-y-2'>
      <legend
        id='post-visibility-label'
        className='text-sm font-medium leading-none'
        data-pw='post-form-visibility-label'
      >
        {t('extracted.postForm.advancedOptionsFields.visibility_7448611d')}
      </legend>
      <Select
        value={privacy}
        onValueChange={(value: PostPrivacy) => setPrivacy(value)}
      >
        <SelectTrigger
          aria-labelledby='post-visibility-label'
          data-pw='post-form-visibility-trigger'
        >
          <SelectValue
            placeholder={t('extracted.postForm.advancedOptionsFields.selectVisibility_50cfa8c8')}
          />
        </SelectTrigger>
        <SelectContent>
          {(privacy === 'public' || !isCommunityPost) && (
            <SelectItem value='public'>
              {t('extracted.postForm.advancedOptionsFields.public_591935b1')}
            </SelectItem>
          )}
          <SelectItem
            value='private'
            data-pw='post-form-visibility-private'
          >
            {t('extracted.postForm.advancedOptionsFields.private_c63eb672')}
          </SelectItem>
        </SelectContent>
      </Select>
    </fieldset>
  )
}

export function PostLanguageField({
  language,
  setLanguage,
}: {
  language: string | null
  setLanguage: (language: string | null) => void
}) {
  const t = useTranslations()
  return (
    <fieldset className='space-y-2'>
      <legend
        id='post-language-label'
        className='text-sm font-medium leading-none'
      >
        {t('extracted.postForm.advancedOptionsFields.language_a4fe6526')}
      </legend>
      <Select
        value={language ?? AUTO_DETECT_LANGUAGE}
        onValueChange={value => setLanguage(value === AUTO_DETECT_LANGUAGE ? null : value)}
      >
        <SelectTrigger aria-labelledby='post-language-label'>
          <SelectValue
            placeholder={t('extracted.postForm.advancedOptionsFields.autoDetect_89ebfb7a')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_DETECT_LANGUAGE}>
            {t('extracted.postForm.advancedOptionsFields.autoDetect_89ebfb7a')}
          </SelectItem>
          {CONTENT_LANGUAGE_SELECT_OPTIONS.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </fieldset>
  )
}
