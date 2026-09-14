/* oxlint-disable max-lines -- topics stories cover all entity topic surfaces; kept in one file for snapshot test parity */
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator } from '@ts-shared/ui-messages'
import { loadJsonMessages } from '@/lib/i18n/load-json-messages'
import { TopicActionsAside } from '@/components/topics/topic-actions-aside'
import { TopicCard } from '@/components/topics/topic-card'
import { TopicDescriptionAside } from '@/components/topics/topic-description-aside'
import { TopicDetailHeader } from '@/components/topics/topic-detail-header'
import { TopicDetailTabs } from '@/components/topics/topic-detail-tabs'
import { TopicFilters } from '@/components/topics/topic-filters'
import { TopicLabel } from '@/components/topics/topic-label'
import { TopicList } from '@/components/topics/topic-list'
import { TopicRecommendationsTable } from '@/components/topic-recommendations/topic-recommendations-table'
import { TopicSourcesAside } from '@/components/topics/topic-sources-aside'
import { EntityStoryFrame, AsideStack, StoryCard, StoryGrid } from './entity-story-frame'
import { hostnamesResponse, rssFeeds, topics, topicsResponse } from './entity-fixtures'
import { recommendationsResponse } from './topics-story-recommendations'

const storyContentUpdate = {
  updated_at: '2026-05-05T00:00:00.000Z',
  updated_by: { id: 'user-0', username: 'jong', display_account: null },
}

const t = createTranslator('en', await loadJsonMessages('en'))

const meta = {
  title: 'Entities/Topics',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Labels: Story = {
  render: () => (
    <EntityStoryFrame title='Topic labels'>
      <StoryGrid>
        {topics.map(topic => (
          <StoryCard
            key={topic.id}
            title={topic.topic_type}
          >
            <TopicLabel topic={topic} />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Topics'
      description='Production topic list covering every public topic type.'
      aside={TopicAsides}
    >
      <TopicList data={topicsResponse} />
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame title='Topic filters'>
      <TopicFilters showSearch />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  parameters: {
    nextjs: {
      navigation: {
        pathname: `/card/${topics[1]!.id}/tags/topic`,
      },
    },
  },
  render: () => (
    <EntityStoryFrame
      title='Topic detail'
      aside={TopicAsides}
    >
      <TopicDetailHeader
        topic={topics[1]!}
        metrics={topicsResponse.topics_metrics[topics[1]!.id]}
        election={topicsResponse.topic_elections?.[topics[1]!.id] ?? null}
        isFollowing
      />
      <TopicDetailTabs
        topicType='card'
        topicId={topics[1]!.id}
        metrics={topicsResponse.topics_metrics[topics[1]!.id]}
        topicTypeName={topics[1]!.topic_type}
        referralProgramId={topics[1]!.referral_program_id}
        isAuthenticated
      />
    </EntityStoryFrame>
  ),
}

export const TopicTypeVariations: Story = {
  render: () => (
    <EntityStoryFrame title='Topic type variations'>
      <StoryGrid>
        {topics.map(topic => (
          <StoryCard
            key={topic.id}
            title={topic.topic_type}
          >
            <TopicDetailHeader
              topic={topic}
              metrics={topicsResponse.topics_metrics[topic.id]}
              election={topicsResponse.topic_elections?.[topic.id] ?? null}
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const Cards: Story = {
  render: () => (
    <EntityStoryFrame title='Topic cards'>
      <StoryGrid>
        {topics.slice(0, 4).map(topic => (
          <StoryCard
            key={topic.id}
            title={topic.topic_type}
          >
            <TopicCard
              topic={topic}
              metrics={topicsResponse.topics_metrics[topic.id]}
              election={topicsResponse.topic_elections?.[topic.id]}
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const CardsPassive: Story = {
  render: () => (
    <EntityStoryFrame title='Topic cards — passive (relation management mode)'>
      <StoryGrid>
        {topics.slice(0, 4).map(topic => (
          <StoryCard
            key={topic.id}
            title={topic.topic_type}
          >
            <TopicCard
              topic={topic}
              metrics={topicsResponse.topics_metrics[topic.id]}
              hideBookmarkActions
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const RecommendationsTable: Story = {
  render: () => (
    <EntityStoryFrame title='Topic recommendations'>
      <TopicRecommendationsTable
        data={recommendationsResponse}
        isAdmin
      />
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='Topic asides'>
      <TopicAsides />
    </EntityStoryFrame>
  ),
}

function TopicAsides() {
  return (
    <AsideStack>
      <TopicActionsAside
        topicId={topics[1]!.id}
        topicType={topics[1]!.topic_type}
        topicSlug={topics[1]!.slug}
        isMuted={false}
      />
      <TopicDescriptionAside
        t={t}
        topicName={topics[1]!.name}
        html='<p>A production aside showing the topic summary rendered from sanitized markdown.</p>'
        contentUpdate={storyContentUpdate}
      />
      <TopicSourcesAside
        t={t}
        rssFeeds={{
          results: rssFeeds.slice(0, 3),
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
          topic_elections: {},
          hostname_elections: {},
        }}
        hostnames={hostnamesResponse}
      />
    </AsideStack>
  )
}
