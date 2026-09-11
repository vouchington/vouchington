'use client'

import { PostDefaultSelect } from './post-default-select'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { VisibilitySectionsProps } from './visibility-sections'

const BROADCAST_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'users', label: 'Logged-in Users' },
  { value: 'followers', label: 'Followers' },
  { value: 'mutual_followers', label: 'Mutual Followers' },
]

const POST_PRIVACY_OPTIONS = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
]

export function PostDefaultsSection({ pending, settings, onChange }: VisibilitySectionsProps) {
  const t = useTranslations()
  return (
    <section className='space-y-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.privacyForm.visibilitySections.postDefaults_d4f71d9e')}
      </h2>
      <PostDefaultSelect
        id='default_post_broadcast'
        dataPw={{
          trigger: 'default-post-broadcast-select',
          options: {
            everyone: 'default-post-broadcast-option-everyone',
            users: 'default-post-broadcast-option-users',
            followers: 'default-post-broadcast-option-followers',
            mutual_followers: 'default-post-broadcast-option-mutual-followers',
          },
        }}
        label='Default post audience'
        options={BROADCAST_OPTIONS}
        value={settings.default_post_broadcast}
        onChange={value => onChange('default_post_broadcast', value)}
        disabled={pending.has('default_post_broadcast')}
      />
      <PostDefaultSelect
        id='default_post_privacy'
        dataPw={{
          trigger: 'default-post-privacy-select',
          options: {
            public: 'default-post-privacy-option-public',
            private: 'default-post-privacy-option-private',
          },
        }}
        label='Default post privacy'
        options={POST_PRIVACY_OPTIONS}
        value={settings.default_post_privacy}
        onChange={value => onChange('default_post_privacy', value)}
        disabled={pending.has('default_post_privacy')}
      />
    </section>
  )
}
