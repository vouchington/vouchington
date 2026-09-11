import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator, loadMessages } from '@ts-shared/ui-messages'
import { TopicActionsAside } from '@/components/topics/topic-actions-aside'
import { TopicDescriptionAside } from '@/components/topics/topic-description-aside'
import { EntityStoryFrame, AsideStack } from './entity-story-frame'

const meta = {
  title: 'Entities/Topics/Asides',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const t = createTranslator('en', await loadMessages('en'))

const storyContentUpdate = {
  updated_at: '2026-05-05T00:00:00.000Z',
  updated_by: { id: 'user-0', username: 'jong', display_account: null },
}

export const ActionsAsideSourceTopic: Story = {
  render: () => (
    <EntityStoryFrame title='Source topic aside (rss_feed)'>
      <AsideStack>
        <TopicActionsAside
          topicId='topic-rss_feed'
          topicType='rss_feed'
          topicSlug='fintech-daily'
        />
      </AsideStack>
    </EntityStoryFrame>
  ),
}

export const ActionsAsideLoggedOut: Story = {
  render: () => (
    <EntityStoryFrame title='Topic Actions aside (logged-out — RSS only)'>
      <AsideStack>
        <TopicActionsAside
          topicId='topic-0'
          topicType='card'
          topicSlug='trade-platform'
        />
      </AsideStack>
    </EntityStoryFrame>
  ),
}

export const AboutCardDescriptionOnly: Story = {
  render: () => (
    <EntityStoryFrame title='About card — description without update line'>
      <AsideStack>
        <TopicDescriptionAside
          t={t}
          topicName='Sapphire Reserve'
          html='<p>A production aside showing the topic summary rendered from sanitized markdown.</p>'
        />
      </AsideStack>
    </EntityStoryFrame>
  ),
}

export const AboutCardDescriptionWithUpdate: Story = {
  render: () => (
    <EntityStoryFrame title='About card — description with update line'>
      <AsideStack>
        <TopicDescriptionAside
          t={t}
          topicName='Sapphire Reserve'
          html='<p>A production aside showing the topic summary rendered from sanitized markdown.</p>'
          contentUpdate={storyContentUpdate}
        />
      </AsideStack>
    </EntityStoryFrame>
  ),
}

export const AboutCardUpdateOnly: Story = {
  render: () => (
    <EntityStoryFrame title='About card — update line only (no description)'>
      <AsideStack>
        <TopicDescriptionAside
          t={t}
          topicName='Sapphire Reserve'
          html=''
          contentUpdate={storyContentUpdate}
        />
      </AsideStack>
    </EntityStoryFrame>
  ),
}
