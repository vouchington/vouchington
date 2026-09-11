import { render } from '@testing-library/react'
import type { ComponentType, ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import PodcastEpisodesLoading from '@/app/(podcasts)/podcast-episodes/loading'
import PodcastsLoading from '@/app/(podcasts)/podcasts/loading'
import PostsLoading from '@/app/(posts)/posts/loading'
import StoriesLoading from '@/app/(posts)/stories/loading'
import CardsLoading from '@/app/(topics)/cards/loading'
import InstancesLoading from '@/app/(topics)/instances/loading'
import ReferralProgramsLoading from '@/app/(topics)/referral-programs/loading'
import RewardsProgramStatusesLoading from '@/app/(topics)/rewards-program-statuses/loading'
import RewardsProgramsLoading from '@/app/(topics)/rewards-programs/loading'
import SpendingCategoriesLoading from '@/app/(topics)/spending-categories/loading'
import TopicsLoading from '@/app/(topics)/topics/loading'
import VideosLoading from '@/app/(videos)/videos/loading'
import NewsLoading from '@/app/news/loading'
import { AsideSkeleton } from '@/components/asides/aside-skeleton'
import { CommunitiesListSkeleton } from '@/components/communities/communities-list-skeleton'
import { FeedSkeleton } from '@/components/feed/feed-skeleton'
import { SettingsPageSkeleton } from '@/components/my/settings-page-skeleton'
import { NewsListSkeleton } from '@/components/news/news-list-skeleton'
import { PageWithAside } from '@/components/page-with-aside'
import { PodcastListSkeleton } from '@/components/podcasts/podcast-list-skeleton'
import { PostListSkeleton } from '@/components/posts/post-list-skeleton'
import { TopicListSkeleton } from '@/components/topics/topic-list-skeleton'
import { UserProfileSkeleton } from '@/components/users/user-profile-skeleton'

type LoadingBoundaryProps = {
  aside?: ComponentType
  children: ReactElement
  showFooter?: boolean
}

type LoadingBoundary = () => ReactElement<LoadingBoundaryProps>

const loadingBoundaries: Array<{
  aside?: ComponentType
  loading: LoadingBoundary
  name: string
  showFooter?: boolean
  skeleton: ComponentType
}> = [
  {
    aside: AsideSkeleton,
    loading: PodcastEpisodesLoading,
    name: 'podcast episodes',
    skeleton: NewsListSkeleton,
  },
  { loading: PodcastsLoading, name: 'podcasts', showFooter: false, skeleton: PodcastListSkeleton },
  { aside: AsideSkeleton, loading: PostsLoading, name: 'posts', skeleton: PostListSkeleton },
  { aside: AsideSkeleton, loading: StoriesLoading, name: 'stories', skeleton: PostListSkeleton },
  { aside: AsideSkeleton, loading: CardsLoading, name: 'cards', skeleton: TopicListSkeleton },
  {
    aside: AsideSkeleton,
    loading: InstancesLoading,
    name: 'instances',
    skeleton: TopicListSkeleton,
  },
  {
    aside: AsideSkeleton,
    loading: ReferralProgramsLoading,
    name: 'referral programs',
    skeleton: TopicListSkeleton,
  },
  {
    aside: AsideSkeleton,
    loading: RewardsProgramStatusesLoading,
    name: 'reward program statuses',
    skeleton: TopicListSkeleton,
  },
  {
    aside: AsideSkeleton,
    loading: RewardsProgramsLoading,
    name: 'reward programs',
    skeleton: TopicListSkeleton,
  },
  {
    aside: AsideSkeleton,
    loading: SpendingCategoriesLoading,
    name: 'spending categories',
    skeleton: TopicListSkeleton,
  },
  { aside: AsideSkeleton, loading: TopicsLoading, name: 'topics', skeleton: TopicListSkeleton },
  { aside: AsideSkeleton, loading: VideosLoading, name: 'videos', skeleton: NewsListSkeleton },
  { aside: AsideSkeleton, loading: NewsLoading, name: 'news', skeleton: NewsListSkeleton },
]

const skeletons: Array<{
  component: ComponentType
  count: number
  name: string
}> = [
  { component: AsideSkeleton, count: 4, name: 'aside' },
  { component: CommunitiesListSkeleton, count: 7, name: 'communities list' },
  { component: FeedSkeleton, count: 6, name: 'feed' },
  { component: SettingsPageSkeleton, count: 6, name: 'settings page' },
  { component: NewsListSkeleton, count: 22, name: 'news list' },
  { component: PodcastListSkeleton, count: 9, name: 'podcast list' },
  { component: PostListSkeleton, count: 8, name: 'post list' },
  { component: TopicListSkeleton, count: 18, name: 'topic list' },
  { component: UserProfileSkeleton, count: 8, name: 'user profile' },
]

describe('list-route loading boundaries', () => {
  it.each(loadingBoundaries)(
    'keeps the $name loader on its intended shell',
    ({ aside, loading, showFooter, skeleton }) => {
      const element = loading()

      expect(element.type).toBe(PageWithAside)
      expect(element.props.children.type).toBe(skeleton)
      expect(element.props.aside).toBe(aside)
      expect(element.props.showFooter).toBe(showFooter)
    },
  )

  it.each(skeletons)(
    'renders $count shared primitives in the $name skeleton',
    ({ component, count }) => {
      const Component = component
      const { container } = render(<Component />)

      expect(container.querySelectorAll("[data-pw='skeleton']")).toHaveLength(count)
    },
  )
})
