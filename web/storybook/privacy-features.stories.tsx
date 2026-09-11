// guardrails-disable-file unique-exports
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CookieConsentBanner } from '@/components/cookie-consent-banner'
import { AudienceSelect } from '@/components/my/audience-select'
import { PrivacyForm, type PrivacyFormInitialUser } from '@/components/my/privacy-form'
import { PostDefaultSelect } from '@/components/my/privacy-form/post-default-select'
import { PostDefaultsSection } from '@/components/my/privacy-form/post-defaults-section'
import { PrivacyToggles } from '@/components/my/privacy-form/privacy-toggles'
import {
  ActivityVisibilitySection,
  ProfileVisibilitySection,
} from '@/components/my/privacy-form/visibility-sections'
import { SettingsPageHeader } from '@/components/my/settings-page-header'
import { CommunitySettingsFields } from '@/components/communities/community-settings-fields'
import { DeleteAccountDialog } from '@/app/(my)/my/data/delete-account-dialog'
import { VerifiedDisplayPreferencesCard } from '@/app/(my)/my/identity-verification/verified-display-preferences-card'
import { NewSupportThreadClient } from '@/app/(chat)/chat/support/new/new-support-thread-client'
import { storyCurrentUser } from './entities/entity-fixtures'

const privacyUser = {
  ...storyCurrentUser,
  cards_visibility: 'nobody',
  rewards_program_statuses_visibility: 'nobody',
  spending_categories_visibility: 'nobody',
  follows_visibility: 'followers',
  topic_follows_visibility: 'everyone',
  rss_feed_follows_visibility: 'users',
  community_memberships_visibility: 'mutual_followers',
  followers_visibility: 'users',
  likes_visibility: 'followers',
  default_post_broadcast: 'followers',
  default_post_privacy: 'private',
  processing_restricted_at: null,
  third_party_marketing: false,
} satisfies typeof storyCurrentUser

const meta = {
  title: 'Privacy Features',
  parameters: { auth: { currentUser: privacyUser } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const sectionSettings = {
  cards_visibility: 'nobody',
  rewards_program_statuses_visibility: 'nobody',
  spending_categories_visibility: 'nobody',
  follows_visibility: 'followers',
  topic_follows_visibility: 'everyone',
  rss_feed_follows_visibility: 'users',
  community_memberships_visibility: 'mutual_followers',
  followers_visibility: 'users',
  likes_visibility: 'followers',
  default_post_broadcast: 'followers',
  default_post_privacy: 'private',
  direct_messages_audience: 'everyone',
} as const

const privacyFormInitialUser = {
  ...sectionSettings,
  id: 'storybook-privacy-user',
  processing_restricted_at: null,
  third_party_marketing: false,
} satisfies PrivacyFormInitialUser

export const PrivacySettings: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl space-y-6'>
        <SettingsPageHeader
          title='Privacy'
          description='Control activity visibility, post defaults, marketing, and processing.'
        />
        <PrivacyForm initialUser={privacyFormInitialUser} />
      </div>
    </main>
  ),
}

export const PrivacyControls: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-3xl space-y-8'>
        <AudienceSelect
          id='storybook_audience'
          label='Example audience'
          value='followers'
          onChange={() => {}}
        />
        <PostDefaultSelect
          id='storybook_post_default'
          label='Example post default'
          options={[{ value: 'followers', label: 'Followers' }]}
          value='followers'
          onChange={() => {}}
          disabled={false}
        />
        <ActivityVisibilitySection
          pending={new Set()}
          settings={sectionSettings}
          onChange={() => {}}
        />
        <ProfileVisibilitySection
          pending={new Set()}
          settings={sectionSettings}
          onChange={() => {}}
        />
        <PostDefaultsSection
          pending={new Set()}
          settings={sectionSettings}
          onChange={() => {}}
        />
        <PrivacyToggles
          pending={new Set()}
          processingRestricted={false}
          thirdPartyMarketing={false}
          onMarketingChange={() => {}}
          onRestrictProcessingChange={() => {}}
        />
      </div>
    </main>
  ),
}

export const CookieConsent: Story = {
  decorators: [
    Story => {
      globalThis.localStorage?.removeItem('cookie-consent')
      return <Story />
    },
  ],
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <CookieConsentBanner />
    </main>
  ),
}

export const AccountDataActions: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-2xl space-y-6'>
        <DeleteAccountDialog userId='user-story-current' />
      </div>
    </main>
  ),
}

export const IdentityDisplayPreferences: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-2xl'>
        <VerifiedDisplayPreferencesCard
          verifiedBadgeVisible
          publicVerifiedNameDisplay='first_name_last_initial'
        />
      </div>
    </main>
  ),
}

export const SupportConversationConsent: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-2xl space-y-6'>
        <NewSupportThreadClient conversationId='01960000-0000-7000-8000-000000000001' />
      </div>
    </main>
  ),
}

export const CommunityRosterPrivacy: Story = {
  render: () => (
    <main className='min-h-screen bg-background p-6 text-foreground'>
      <div className='mx-auto max-w-2xl space-y-6'>
        <CommunitySettingsFields
          name='Privacy Club'
          slug='privacy-club'
          markdown='Community fixture for roster privacy review.'
          visibility='private'
          listType='follow'
          memberRosterVisibility='members'
          requiresPostApproval
          allowMemberInvites={false}
          setName={() => {}}
          setSlug={() => {}}
          setMarkdown={() => {}}
          setVisibility={() => {}}
          setListType={() => {}}
          setMemberRosterVisibility={() => {}}
          setRequiresPostApproval={() => {}}
          setAllowMemberInvites={() => {}}
        />
      </div>
    </main>
  ),
}
