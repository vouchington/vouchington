'use client'

import { useState } from 'react'
import { updateMyUser } from '@/lib/api/client/users'
import type { User } from '@/types/user'
import onError, { onSuccess } from '@/lib/on-error'
import { PrivacyToggles } from './privacy-form/privacy-toggles'
import { PostDefaultsSection } from './privacy-form/post-defaults-section'
import {
  ActivityVisibilitySection,
  MessagingSection,
  ProfileVisibilitySection,
} from './privacy-form/visibility-sections'
import { useTranslations } from '@/lib/i18n/use-translations'

export type PrivacyFormInitialUser = Pick<
  User,
  | 'id'
  | 'cards_visibility'
  | 'rewards_program_statuses_visibility'
  | 'spending_categories_visibility'
  | 'follows_visibility'
  | 'topic_follows_visibility'
  | 'rss_feed_follows_visibility'
  | 'community_memberships_visibility'
  | 'followers_visibility'
  | 'likes_visibility'
  | 'direct_messages_audience'
  | 'default_post_broadcast'
  | 'default_post_privacy'
  | 'processing_restricted_at'
  | 'third_party_marketing'
>

export function PrivacyForm({ initialUser }: { initialUser: PrivacyFormInitialUser }) {
  const t = useTranslations()
  const userId = initialUser.id

  const [pending, setPending] = useState<Set<string>>(new Set())
  const [settings, setSettings] = useState({
    cards_visibility: initialUser.cards_visibility ?? 'everyone',
    rewards_program_statuses_visibility:
      initialUser.rewards_program_statuses_visibility ?? 'everyone',
    spending_categories_visibility: initialUser.spending_categories_visibility ?? 'nobody',
    follows_visibility: initialUser.follows_visibility ?? 'everyone',
    topic_follows_visibility: initialUser.topic_follows_visibility ?? 'everyone',
    rss_feed_follows_visibility: initialUser.rss_feed_follows_visibility ?? 'everyone',
    community_memberships_visibility: initialUser.community_memberships_visibility ?? 'everyone',
    followers_visibility: initialUser.followers_visibility ?? 'everyone',
    likes_visibility: initialUser.likes_visibility ?? 'everyone',
    direct_messages_audience: initialUser.direct_messages_audience ?? 'everyone',
    default_post_broadcast: initialUser.default_post_broadcast ?? 'everyone',
    default_post_privacy: initialUser.default_post_privacy ?? 'public',
    processing_restricted_at: initialUser.processing_restricted_at != null,
    third_party_marketing: initialUser.third_party_marketing ?? false,
  })

  type SettingsKey = keyof typeof settings

  async function handleMarketingChange(enabled: boolean) {
    if (pending.has('third_party_marketing')) return
    const prev = settings.third_party_marketing

    setSettings(s => ({ ...s, third_party_marketing: enabled }))
    setPending(s => new Set(s).add('third_party_marketing'))
    try {
      await updateMyUser(userId, { third_party_marketing: enabled })
      onSuccess(t('extracted.my.privacyForm.privacySettingUpdated_3c09f089'))
    } catch (error) {
      setSettings(s => ({ ...s, third_party_marketing: prev }))
      onError(error, {
        fallback: t('extracted.my.privacyForm.failedToUpdatePrivacySetting_d08bc692'),
        tags: { form: 'my-privacy', field: 'third_party_marketing' },
      })
    } finally {
      setPending(s => {
        const next = new Set(s)
        next.delete('third_party_marketing')
        return next
      })
    }
  }

  async function updatePrivacySetting(field: SettingsKey, value: string) {
    const prev = settings[field]
    if (value === prev || pending.has(field)) return

    setSettings(s => ({ ...s, [field]: value }))
    setPending(s => new Set(s).add(field))
    try {
      await updateMyUser(userId, { [field]: value })
      onSuccess(t('extracted.my.privacyForm.privacySettingUpdated_3c09f089'))
    } catch (error) {
      setSettings(s => ({ ...s, [field]: prev }))
      onError(error, {
        fallback: t('extracted.my.privacyForm.failedToUpdatePrivacySetting_d08bc692'),
        tags: { form: 'my-privacy', field },
      })
    } finally {
      setPending(s => {
        const next = new Set(s)
        next.delete(field)
        return next
      })
    }
  }

  async function handleRestrictProcessingChange(enabled: boolean) {
    if (pending.has('processing_restricted_at')) return
    const prev = settings.processing_restricted_at

    setSettings(s => ({ ...s, processing_restricted_at: enabled }))
    setPending(s => new Set(s).add('processing_restricted_at'))
    try {
      await updateMyUser(userId, { processing_restricted_at: enabled })
      onSuccess(t('extracted.my.privacyForm.privacySettingUpdated_3c09f089'))
    } catch (error) {
      setSettings(s => ({ ...s, processing_restricted_at: prev }))
      onError(error, {
        fallback: t('extracted.my.privacyForm.failedToUpdatePrivacySetting_d08bc692'),
        tags: { form: 'my-privacy', field: 'processing_restricted_at' },
      })
    } finally {
      setPending(s => {
        const next = new Set(s)
        next.delete('processing_restricted_at')
        return next
      })
    }
  }

  return (
    <div className='space-y-8'>
      <ActivityVisibilitySection
        pending={pending}
        settings={settings}
        onChange={updatePrivacySetting}
      />
      <MessagingSection
        pending={pending}
        settings={settings}
        onChange={updatePrivacySetting}
      />
      <ProfileVisibilitySection
        pending={pending}
        settings={settings}
        onChange={updatePrivacySetting}
      />
      <PostDefaultsSection
        pending={pending}
        settings={settings}
        onChange={updatePrivacySetting}
      />
      <PrivacyToggles
        pending={pending}
        processingRestricted={settings.processing_restricted_at}
        thirdPartyMarketing={settings.third_party_marketing}
        onMarketingChange={handleMarketingChange}
        onRestrictProcessingChange={handleRestrictProcessingChange}
      />
    </div>
  )
}
