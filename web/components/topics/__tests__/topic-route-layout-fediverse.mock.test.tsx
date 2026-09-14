import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicRouteLayout } from '../topic-route-layout'
import { getTopic } from '@/lib/api/server'
import { getFediverseInstance } from '@/lib/api/server/fediverse'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getHostnames } from '@/lib/api/server/hostnames'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import type { TopicDetailLayoutProps } from '../topic-detail-layout'
import {
  emptyHostnames,
  emptyRssFeeds,
  makeTopicData,
} from '../../../test-helpers/components/topics/topic-route-layout-fixtures'

const capturedDetailProps: TopicDetailLayoutProps[] = []

vi.mock(import('@/lib/api/server'), () => ({ getTopic: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/server/fediverse'), () => ({
  getFediverseInstance: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/auth/get-current-user'), () => ({
  getCurrentUser: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/api/server/hostnames'), () => ({ getHostnames: vi.fn<VitestLooseMock>() }))
vi.mock(import('@/lib/api/server/rss-feeds'), () => ({ getRssFeeds: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('../topic-route-asides'),
  () => ({ TopicRouteAsides: () => <div /> }) as unknown as typeof import('../topic-route-asides'),
)
vi.mock(
  import('../topic-follow-context'),
  () => ({ default: async () => null }) as unknown as typeof import('../topic-follow-context'),
)
vi.mock(import('../topic-detail-layout'), () => ({
  TopicDetailLayout: (props: TopicDetailLayoutProps) => {
    capturedDetailProps.push(props)
    return <div>{props.children}</div>
  },
}))
vi.mock(
  import('@/components/page-with-aside'),
  () =>
    ({
      PageWithAside: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/page-with-aside'),
)

describe('TopicRouteLayout fediverse detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedDetailProps.length = 0
    vi.mocked(getCurrentUser).mockResolvedValue(null)
    vi.mocked(getHostnames).mockResolvedValue(
      emptyHostnames as Awaited<ReturnType<typeof getHostnames>>,
    )
    vi.mocked(getRssFeeds).mockResolvedValue(
      emptyRssFeeds as Awaited<ReturnType<typeof getRssFeeds>>,
    )
  })

  it('loads dedicated detail by canonical topic id and projects public sidecars', async () => {
    const topicData = makeTopicData('fediverse_instance')
    vi.mocked(getTopic).mockResolvedValue(
      topicData as unknown as Awaited<ReturnType<typeof getTopic>>,
    )
    vi.mocked(getFediverseInstance).mockResolvedValue({
      topic: topicData.topic,
      fediverse_instance: {
        software: 'mastodon',
        protocol: 'activitypub',
        nodeinfo_software_version: '4.4.0',
        total_users: 1200,
        monthly_active_users: 340,
        open_registrations: true,
      },
      topic_election: null,
      hostname_election: {
        __entity_type: 'hostname_election',
        id: 'hostname-1',
        votes_score_net: 10,
        votes_count_up: 12,
        votes_count_down: 2,
      },
    } as Awaited<ReturnType<typeof getFediverseInstance>>)

    render(
      await TopicRouteLayout({
        id: 'instance-slug',
        topicType: 'fediverse_instance',
        children: <div />,
      }),
    )

    expect(getFediverseInstance).toHaveBeenCalledWith(topicData.topic.id)
    expect(capturedDetailProps.at(-1)?.fediverseInstance).toMatchObject({ software: 'mastodon' })
    expect(capturedDetailProps.at(-1)?.hostnameElection).toMatchObject({ votes_score_net: 10 })
  })
})
