'use client'

import { NewsItemCluster } from './news-item-cluster'
import type { NewsItemClusterData } from './use-news-item-clusters'
import type { FeedStyle } from '@/lib/preferences/shared'
import type { Post } from '@/types/posts'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import type { NewsCommunityDiscussionTarget } from './community-discussion-types'
import type { UrlEmbed } from '@/types/api-responses/posts-topics-and-feeds'

interface NewsItemClusterListRowProps {
  allBookmarks: NonNullable<RssFeedItemsFeedResponseBody['bookmarks']>
  allElectionVotes: NonNullable<RssFeedItemsFeedResponseBody['election_votes']>
  allElections: NonNullable<RssFeedItemsFeedResponseBody['rss_feed_item_elections']>
  allPosts: NonNullable<RssFeedItemsFeedResponseBody['posts']>
  allRelatedPostsByUrlId: NonNullable<RssFeedItemsFeedResponseBody['related_posts_by_url_id']>
  allStories: NonNullable<RssFeedItemsFeedResponseBody['stories']>
  allStoryPostIds: NonNullable<RssFeedItemsFeedResponseBody['story_post_ids']>
  allThumbnailUrls: NonNullable<RssFeedItemsFeedResponseBody['rss_feed_item_thumbnail_url']>
  allEmbeds: NonNullable<RssFeedItemsFeedResponseBody['rss_feed_item_embeds']>
  allUsers: NonNullable<RssFeedItemsFeedResponseBody['users']>
  cluster: NewsItemClusterData
  communityDiscussionTarget?: NewsCommunityDiscussionTarget
  expandedStoryIds: Set<string>
  feedStyle: FeedStyle
  onExpandedStoryIdsChange: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function NewsItemClusterListRow({
  allBookmarks,
  allElectionVotes,
  allElections,
  allPosts,
  allRelatedPostsByUrlId,
  allStories,
  allStoryPostIds,
  allThumbnailUrls,
  allEmbeds,
  allUsers,
  cluster,
  communityDiscussionTarget,
  expandedStoryIds,
  feedStyle,
  onExpandedStoryIdsChange,
}: NewsItemClusterListRowProps) {
  const clusterUrlIds = [cluster.primary.url.id, ...cluster.storyItems.map(item => item.url.id)]
  const storyRelatedUrlIds = [...new Set(clusterUrlIds)]
  const clusterRelatedPosts = getRelatedPostsForUrlIds(
    storyRelatedUrlIds,
    allRelatedPostsByUrlId,
    allPosts,
  )
  const storyItemActionContexts = Object.fromEntries(
    cluster.storyItems.map(item => [
      item.id,
      {
        election: allElections[item.id],
        electionVote: allElectionVotes[item.id],
        relatedPosts: clusterRelatedPosts,
        viewerBookmarks: allBookmarks[item.id],
      },
    ]),
  )
  const story = cluster.storyId ? allStories[cluster.storyId] : undefined
  const storyPostId = cluster.storyId ? allStoryPostIds[cluster.storyId] : undefined
  const storyPost = storyPostId ? allPosts[storyPostId] : undefined

  return (
    <NewsItemCluster
      key={cluster.primaryResult.id}
      primary={cluster.primary}
      primaryElection={allElections[cluster.primary.id]}
      primaryElectionVote={allElectionVotes[cluster.primary.id]}
      storyItems={cluster.storyItems}
      story={story}
      storyPost={storyPost}
      view={feedStyle}
      relatedPosts={clusterRelatedPosts}
      communityDiscussionTarget={communityDiscussionTarget}
      viewerBookmarks={allBookmarks[cluster.primary.id]}
      storyRelatedUrlIds={storyRelatedUrlIds}
      thumbnailUrls={allThumbnailUrls}
      embeds={allEmbeds}
      expanded={cluster.storyId ? expandedStoryIds.has(cluster.storyId) : undefined}
      onExpandedChange={
        cluster.storyId
          ? expanded => {
              onExpandedStoryIdsChange(prev => {
                const next = new Set(prev)
                if (expanded) next.add(cluster.storyId!)
                else next.delete(cluster.storyId!)
                return next
              })
            }
          : undefined
      }
      storyItemActionContexts={storyItemActionContexts}
      sharedByUser={
        cluster.primaryResult.shared_by_user_id
          ? allUsers[cluster.primaryResult.shared_by_user_id]
          : undefined
      }
      sharedAt={cluster.primaryResult.shared_at}
    />
  )
}

function getRelatedPostsForUrlIds(
  urlIds: string[],
  allRelatedPostsByUrlId: NonNullable<RssFeedItemsFeedResponseBody['related_posts_by_url_id']>,
  allPosts: NonNullable<RssFeedItemsFeedResponseBody['posts']>,
): Post[] {
  const relatedPostIds = [...new Set(urlIds.flatMap(urlId => allRelatedPostsByUrlId[urlId] ?? []))]
  return relatedPostIds.flatMap(id => (allPosts[id] !== undefined ? [allPosts[id]] : []))
}
