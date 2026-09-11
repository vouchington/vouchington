'use client'

import type { UserPrivacyAudience } from '@/types/user'
import { AudienceSelect } from '../audience-select'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface PrivacySettings {
  cards_visibility: UserPrivacyAudience
  rewards_program_statuses_visibility: UserPrivacyAudience
  spending_categories_visibility: UserPrivacyAudience
  follows_visibility: UserPrivacyAudience
  topic_follows_visibility: UserPrivacyAudience
  rss_feed_follows_visibility: UserPrivacyAudience
  community_memberships_visibility: UserPrivacyAudience
  followers_visibility: UserPrivacyAudience
  likes_visibility: UserPrivacyAudience
  direct_messages_audience: UserPrivacyAudience
  default_post_broadcast: string
  default_post_privacy: string
}

export interface VisibilitySectionsProps {
  pending: Set<string>
  settings: PrivacySettings
  onChange: (field: keyof PrivacySettings, value: string) => void
}

export function ActivityVisibilitySection({
  pending,
  settings,
  onChange,
}: VisibilitySectionsProps) {
  const t = useTranslations()
  return (
    <section className='space-y-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.privacyForm.visibilitySections.activityVisibility_4c596d7f')}
      </h2>
      <AudienceSelect
        id='follows_visibility'
        dataPw={{
          trigger: 'follows-visibility-select',
          options: {
            everyone: 'follows-visibility-option-everyone',
            users: 'follows-visibility-option-users',
            followers: 'follows-visibility-option-followers',
            mutual_followers: 'follows-visibility-option-mutual-followers',
            nobody: 'follows-visibility-option-nobody',
          },
        }}
        label='Who can see your followed users'
        value={settings.follows_visibility}
        onChange={v => onChange('follows_visibility', v)}
        disabled={pending.has('follows_visibility')}
      />
      <AudienceSelect
        id='topic_follows_visibility'
        label='Who can see your followed topics'
        value={settings.topic_follows_visibility}
        onChange={v => onChange('topic_follows_visibility', v)}
        disabled={pending.has('topic_follows_visibility')}
      />
      <AudienceSelect
        id='rss_feed_follows_visibility'
        label='Who can see your followed feeds'
        value={settings.rss_feed_follows_visibility}
        onChange={v => onChange('rss_feed_follows_visibility', v)}
        disabled={pending.has('rss_feed_follows_visibility')}
      />
      <AudienceSelect
        id='community_memberships_visibility'
        label='Who can see your community memberships'
        value={settings.community_memberships_visibility}
        onChange={v => onChange('community_memberships_visibility', v)}
        disabled={pending.has('community_memberships_visibility')}
      />
      <AudienceSelect
        id='followers_visibility'
        label='Who can see your followers'
        value={settings.followers_visibility}
        onChange={v => onChange('followers_visibility', v)}
        disabled={pending.has('followers_visibility')}
      />
      <AudienceSelect
        id='likes_visibility'
        label='Who can see your trust choices'
        value={settings.likes_visibility}
        onChange={v => onChange('likes_visibility', v)}
        disabled={pending.has('likes_visibility')}
      />
    </section>
  )
}

export function MessagingSection({ pending, settings, onChange }: VisibilitySectionsProps) {
  const t = useTranslations()
  return (
    <section className='space-y-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.privacyForm.visibilitySections.messaging_eebdbb25')}
      </h2>
      <AudienceSelect
        id='direct_messages_audience'
        dataPw={{
          trigger: 'direct-messages-audience-select',
          options: {
            everyone: 'direct-messages-audience-option-everyone',
            users: 'direct-messages-audience-option-users',
            followers: 'direct-messages-audience-option-followers',
            mutual_followers: 'direct-messages-audience-option-mutual-followers',
            nobody: 'direct-messages-audience-option-nobody',
          },
        }}
        label='Who can send you direct messages'
        value={settings.direct_messages_audience}
        onChange={v => onChange('direct_messages_audience', v)}
        disabled={pending.has('direct_messages_audience')}
      />
      <p className='text-sm text-muted-foreground'>
        {t('extracted.privacyForm.visibilitySections.controlWhoCanStartADirect_0704d217')}
      </p>
    </section>
  )
}

export function ProfileVisibilitySection({ pending, settings, onChange }: VisibilitySectionsProps) {
  const t = useTranslations()
  return (
    <section className='space-y-4'>
      <h2 className='text-lg font-semibold'>
        {t('extracted.privacyForm.visibilitySections.profileVisibility_2291938e')}
      </h2>
      <AudienceSelect
        id='cards_visibility'
        label='Who can see your cards'
        value={settings.cards_visibility}
        onChange={v => onChange('cards_visibility', v)}
        disabled={pending.has('cards_visibility')}
      />
      <AudienceSelect
        id='rewards_program_statuses_visibility'
        label='Who can see your reward statuses'
        value={settings.rewards_program_statuses_visibility}
        onChange={v => onChange('rewards_program_statuses_visibility', v)}
        disabled={pending.has('rewards_program_statuses_visibility')}
      />
      <AudienceSelect
        id='spending_categories_visibility'
        label='Who can see your spending'
        value={settings.spending_categories_visibility}
        onChange={v => onChange('spending_categories_visibility', v)}
        disabled={pending.has('spending_categories_visibility')}
      />
    </section>
  )
}
