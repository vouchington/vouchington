import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createTranslator, loadMessages } from '@ts-shared/ui-messages'
import { PostAuthorAside } from '@/components/posts/post-author-aside'
import { PostDetailView as PostDetail } from '@/components/posts/post-detail-view'
import { PostDetailTabs } from '@/components/posts/post-detail-tabs'
import { PostFilters } from '@/components/posts/post-filters'
import { PostList } from '@/components/posts/post-list'
import { ReviewReferralPrograms } from '@/components/posts/review-referral-programs'
import { ReferralLinksAsideContent } from '@/components/referral-links/referral-links-aside-content'
import { TopicRelatedTopicsAsideContent } from '@/components/tags/topic-related-topics-aside-content'
import type { EntityRelation } from '@/lib/api/entity-relations'
import {
  EntityStoryFrame,
  EntityStorySection,
  AsideStack,
  StoryGrid,
  StoryCard,
} from './entity-story-frame'
import { posts, postsResponse, topics, publicUsers } from './entity-fixtures'

const t = createTranslator('en', await loadMessages('en'))

const meta = {
  title: 'Entities/Posts',
  parameters: { auth: { currentUser: null } },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ListPage: Story = {
  render: () => (
    <EntityStoryFrame
      title='Posts'
      description='Production post list with every public post type represented.'
      aside={PostAsides}
    >
      <PostList data={postsResponse} />
    </EntityStoryFrame>
  ),
}

export const ListForm: Story = {
  render: () => (
    <EntityStoryFrame
      title='Post filters'
      description='Search, topic autocomplete, sorting, and submit controls.'
    >
      <PostFilters />
    </EntityStoryFrame>
  ),
}

export const MainPageContent: Story = {
  render: () => (
    <EntityStoryFrame
      title='Review detail'
      aside={PostAsides}
    >
      <PostDetail
        post={posts[1]!}
        html='<p>This rendered review exercises the production detail page, markdown content, ratings, vote actions, and related topic chips.</p>'
        election={postsResponse.post_elections?.[posts[1]!.id]}
      />
      <PostDetailTabs
        activeTab='manage-tags'
        commentCount={1000}
        postType='review'
        postId={posts[1]!.id}
        isAuthenticated
        activeTag='topic'
      />
    </EntityStoryFrame>
  ),
}

export const PostTypeVariations: Story = {
  render: () => (
    <EntityStoryFrame title='Post type variations'>
      <StoryGrid>
        {posts.map(post => (
          <StoryCard
            key={post.id}
            title={post.post_type}
          >
            <PostDetail
              post={post}
              html={`<p>${post.markdown}</p>`}
              election={postsResponse.post_elections?.[post.id]}
            />
          </StoryCard>
        ))}
      </StoryGrid>
    </EntityStoryFrame>
  ),
}

export const Asides: Story = {
  render: () => (
    <EntityStoryFrame title='Post asides'>
      <PostAsides />
    </EntityStoryFrame>
  ),
}

function PostAsides() {
  return (
    <AsideStack>
      <PostAuthorAside
        author={{
          __entity_type: 'user',
          id: publicUsers[0]!.id,
          username: publicUsers[0]!.username!,
          profile_image_id: publicUsers[0]!.profile_image_id ?? null,
          is_official_account: publicUsers[0]!.is_official_account,
        }}
        aside={{
          about_html:
            '<p>Alex writes card reviews, approval data points, and travel redemption notes.</p>',
          profile_links: [],
          is_following: true,
        }}
        postType='review'
      />
      <EntityStorySection title='Referral programs'>
        <ReviewReferralPrograms post={posts[1]!} />
      </EntityStorySection>
      <ReferralLinksAsideContent
        topicId='referral-program-1'
        topicType='referral-program'
        response={{
          links: [
            {
              id: 'priority-referral-link',
              user_id: publicUsers[0]!.id,
              is_official: false,
              referral_program_id: 'referral-program-1',
              url: 'https://bank.example/ref/alex',
              label: 'Alex card referral',
              priority_group: 1,
              contribution_rank: 1,
              tier_rank: 1,
              best_score: 5,
              review_post_id: posts[1]!.id,
              review_post_slug: posts[1]!.slug ?? null,
              review_avg_rating: 5,
            },
          ],
          users: {
            [publicUsers[0]!.id]: {
              id: publicUsers[0]!.id,
              username: publicUsers[0]!.username!,
              display_name: publicUsers[0]!.display_account?.name ?? null,
            },
          },
        }}
      />
      <TopicRelatedTopicsAsideContent
        topic={topics[1]!}
        showManageButton={false}
        t={t}
        relations={topics.slice(0, 4).map((topic): EntityRelation => ({
          id: `relation-${topic.id}`,
          subject_id: topics[1]!.id,
          object_id: topic.id,
          created_at: topic.created_at,
          created_by_id: topic.created_by.id,
          object_data: {
            id: topic.id,
            name: topic.name,
            slug: topic.slug,
            topic_type: topic.topic_type,
          },
          votes_score_net: 4,
          votes_count_up: 5,
          votes_count_down: 1,
        }))}
      />
    </AsideStack>
  )
}
