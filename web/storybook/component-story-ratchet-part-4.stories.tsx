import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { componentStoryRatchetParameters } from './component-story-ratchet-parameters'
import {
  ComponentStoryRatchetGrid,
  type RatchetedComponent,
} from './component-story-ratchet-renderer'
import { CommunityDangerZone as CommunitiesCommunityDangerZoneCommunityDangerZone } from '@/components/communities/community-danger-zone'
import { CommunityNav as CommunitiesCommunityNavCommunityNav } from '@/components/communities/community-nav'
import { CommunitySettingsForm as CommunitiesCommunitySettingsFormCommunitySettingsForm } from '@/components/communities/community-settings-form'
import { InviteManager as CommunitiesInviteManagerInviteManager } from '@/components/communities/invite-manager'
import CommunitiesJoinButtonDefault from '@/components/communities/join-button'
import CommunitiesMessageModsButtonDefault from '@/components/communities/message-mods-button'
import { ModQueueReports as CommunitiesModQueueReportsModQueueReports } from '@/components/communities/mod-queue-reports'
import { ModmailInbox as CommunitiesModmailInboxModmailInbox } from '@/components/communities/modmail-inbox'
import { DisputeForm as DisputesDisputeFormDisputeForm } from '@/components/disputes/dispute-form'
import { DisputeReviewButton as DisputesDisputeReviewButtonDisputeReviewButton } from '@/components/disputes/dispute-review-button'
import { DisputeReviewDialog as DisputesDisputeReviewDialogDisputeReviewDialog } from '@/components/disputes/dispute-review-dialog'
import { BlockHostnameQuickAdd as DomainsBlockHostnameQuickAddBlockHostnameQuickAdd } from '@/components/domains/block-hostname-quick-add'
import { HostnameModerationControls as DomainsHostnameModerationControlsHostnameModerationControls } from '@/components/domains/hostname-moderation-controls'
import { ManageCategoriesMenuItem as FeedManageCategoriesMenuItemManageCategoriesMenuItem } from '@/components/feed/manage-categories-menu-item'
import { PodcastEpisodePlayer as FeedPodcastEpisodePlayerPodcastEpisodePlayer } from '@/components/feed/podcast-episode-player'
import { VideoEmbed as FeedVideoEmbedVideoEmbed } from '@/components/feed/video-embed'
import { PublicLandingPageHeader as LandingPagesPublicLandingPageHeaderPublicLandingPageHeader } from '@/components/landing-pages/public-landing-page-header'
import { PublicLandingPageItems as LandingPagesPublicLandingPageItemsPublicLandingPageItems } from '@/components/landing-pages/public-landing-page-items'

const ratchetedComponentsPart4 = [
  {
    key: 'web/components/communities/community-danger-zone.tsx#CommunityDangerZone',
    component: CommunitiesCommunityDangerZoneCommunityDangerZone,
  },
  {
    key: 'web/components/communities/community-nav.tsx#CommunityNav',
    component: CommunitiesCommunityNavCommunityNav,
  },
  {
    key: 'web/components/communities/community-settings-form.tsx#CommunitySettingsForm',
    component: CommunitiesCommunitySettingsFormCommunitySettingsForm,
  },
  {
    key: 'web/components/communities/invite-manager.tsx#InviteManager',
    component: CommunitiesInviteManagerInviteManager,
  },
  {
    key: 'web/components/communities/join-button.tsx#default',
    component: CommunitiesJoinButtonDefault,
  },
  {
    key: 'web/components/communities/message-mods-button.tsx#default',
    component: CommunitiesMessageModsButtonDefault,
  },
  {
    key: 'web/components/communities/mod-queue-reports.tsx#ModQueueReports',
    component: CommunitiesModQueueReportsModQueueReports,
  },
  {
    key: 'web/components/communities/modmail-inbox.tsx#ModmailInbox',
    component: CommunitiesModmailInboxModmailInbox,
  },
  {
    key: 'web/components/disputes/dispute-form.tsx#DisputeForm',
    component: DisputesDisputeFormDisputeForm,
  },
  {
    key: 'web/components/disputes/dispute-review-button.tsx#DisputeReviewButton',
    component: DisputesDisputeReviewButtonDisputeReviewButton,
  },
  {
    key: 'web/components/disputes/dispute-review-dialog.tsx#DisputeReviewDialog',
    component: DisputesDisputeReviewDialogDisputeReviewDialog,
  },
  {
    key: 'web/components/domains/block-hostname-quick-add.tsx#BlockHostnameQuickAdd',
    component: DomainsBlockHostnameQuickAddBlockHostnameQuickAdd,
  },
  {
    key: 'web/components/domains/hostname-moderation-controls.tsx#HostnameModerationControls',
    component: DomainsHostnameModerationControlsHostnameModerationControls,
  },
  {
    key: 'web/components/feed/manage-categories-menu-item.tsx#ManageCategoriesMenuItem',
    component: FeedManageCategoriesMenuItemManageCategoriesMenuItem,
  },
  {
    key: 'web/components/feed/podcast-episode-player.tsx#PodcastEpisodePlayer',
    component: FeedPodcastEpisodePlayerPodcastEpisodePlayer,
  },
  { key: 'web/components/feed/video-embed.tsx#VideoEmbed', component: FeedVideoEmbedVideoEmbed },
  {
    key: 'web/components/landing-pages/public-landing-page-header.tsx#PublicLandingPageHeader',
    component: LandingPagesPublicLandingPageHeaderPublicLandingPageHeader,
  },
  {
    key: 'web/components/landing-pages/public-landing-page-items.tsx#PublicLandingPageItems',
    component: LandingPagesPublicLandingPageItemsPublicLandingPageItems,
  },
] satisfies RatchetedComponent[]

const meta = {
  title: 'Coverage/Component Story Ratchet Part 4',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CoveragePart4: Story = {
  parameters: componentStoryRatchetParameters,
  render: () => (
    <ComponentStoryRatchetGrid
      title='Component Story Ratchet Part 4'
      components={ratchetedComponentsPart4}
    />
  ),
}
