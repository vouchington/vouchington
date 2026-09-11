import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { fn } from 'storybook/test'
import {
  ModQueueBanEvasionInfo,
  ModQueueBanEvasionActions,
} from '@/components/communities/mod-queue-ban-evasion'
import type { CommunityBanEvasionContext } from '@/types/api-responses'
import { EntityStoryFrame } from './entity-story-frame'

const meta = {
  title: 'Entities/Communities/ModQueueBanEvasion',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const banEvasion: CommunityBanEvasionContext = {
  community_id: 'community-1',
  community_slug: 'credit-cards',
  source_user_id: 'user-source-1',
  source_username: 'original-user',
  score: 0.87,
  flagged_at: '2026-05-25T12:00:00.000Z',
}

export const BanEvasionInfoStory: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban Evasion Info'
      description='Badge and source-user context shown in the community mod queue for suspected ban-evasion reports.'
    >
      <ModQueueBanEvasionInfo banEvasion={banEvasion} />
    </EntityStoryFrame>
  ),
}

export const BanEvasionInfoAnonymousStory: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban Evasion Info — anonymous source'
      description='When the source user has no username (deleted account), falls back to the raw user ID.'
    >
      <ModQueueBanEvasionInfo banEvasion={{ ...banEvasion, source_username: null }} />
    </EntityStoryFrame>
  ),
}

export const BanEvasionActionsStory: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban Evasion Actions'
      description='Confirm and Dismiss buttons shown in the community mod queue ban-evasion report card.'
    >
      <div className='flex gap-2'>
        <ModQueueBanEvasionActions
          banEvasion={banEvasion}
          entityId='user-suspect-1'
          reportId='report-1'
          disabled={false}
          onAction={fn()}
        />
      </div>
    </EntityStoryFrame>
  ),
}

export const BanEvasionActionsDisabledStory: Story = {
  render: () => (
    <EntityStoryFrame
      title='Ban Evasion Actions — disabled'
      description='Buttons in disabled state during a bulk action.'
    >
      <div className='flex gap-2'>
        <ModQueueBanEvasionActions
          banEvasion={banEvasion}
          entityId='user-suspect-1'
          reportId='report-1'
          disabled
          onAction={fn()}
        />
      </div>
    </EntityStoryFrame>
  ),
}
