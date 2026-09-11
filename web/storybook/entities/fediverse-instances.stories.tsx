import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { FediverseInstanceMetadata } from '@/components/topics/fediverse-instance-metadata'
import { TopicCard } from '@/components/topics/topic-card'
import { TopicCardFediverseRow } from '@/components/topics/topic-card-fediverse-row'
import { topics } from './entity-fixtures'
import { EntityStoryFrame, StoryCard, StoryGrid } from './entity-story-frame'
import type { FediverseInstanceAttributes } from '@/types/fediverse-instances'
import type { HostnameElection } from '@/types/hostnames'

const instance = topics.find(topic => topic.topic_type === 'fediverse_instance')!
const attributes: FediverseInstanceAttributes = {
  software: 'mastodon',
  protocol: 'activitypub',
  nodeinfo_software_version: '4.4.0',
  total_users: 1200,
  monthly_active_users: 340,
  open_registrations: true,
}
const hostnameElection: HostnameElection = {
  __entity_type: 'hostname_election',
  id: instance.hostname!.id,
  votes_score_net: 10,
  votes_count_up: 12,
  votes_count_down: 2,
}

const meta = {
  title: 'Entities/Fediverse Instances',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const DirectoryCards: Story = {
  render: () => (
    <EntityStoryFrame title='Fediverse instance directory cards'>
      <StoryGrid>
        <StoryCard title='Classified and trusted'>
          <TopicCard
            topic={instance}
            fediverseInstance={attributes}
            hostnameElection={hostnameElection}
          />
        </StoryCard>
        <StoryCard title='Unclassified and unrated'>
          <TopicCard topic={instance} />
        </StoryCard>
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const DetailMetadata: Story = {
  render: () => (
    <EntityStoryFrame title='Fediverse instance metadata'>
      <FediverseInstanceMetadata
        topic={instance}
        attributes={attributes}
        hostnameElection={hostnameElection}
      />
    </EntityStoryFrame>
  ),
}

export const CardMetadataRow: Story = {
  render: () => (
    <EntityStoryFrame title='Fediverse instance card metadata'>
      <TopicCardFediverseRow
        topic={instance}
        fediverseInstance={attributes}
        hostnameElection={hostnameElection}
      />
    </EntityStoryFrame>
  ),
}
