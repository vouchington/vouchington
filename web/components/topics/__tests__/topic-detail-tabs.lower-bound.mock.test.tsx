import { navMockModule, createNavMock } from 'vouchington-tooling/next-navigation-mock'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadWebApiFixture } from '@/test-helpers/api-responses/fixture-loader'
import { TopicDetailTabs } from '../topic-detail-tabs'

vi.mock(
  import('next/navigation'),
  () => navMockModule as unknown as typeof import('next/navigation'),
)
const nav = createNavMock()

describe('topic viewer count input exhaustion', () => {
  it('shows the Posts tab as zero plus when uninspected inputs may contain visible posts', () => {
    nav.reset()
    nav.setPathname('/card/test-topic/news')
    const fixture = loadWebApiFixture('web.topics.show.viewer-lower-bound')
    render(
      <TopicDetailTabs
        topicType='card'
        topicId='topic-1'
        topicSlug='test-topic'
        metrics={fixture.topic_metrics}
      />,
    )
    expect(screen.getByRole('menuitem', { name: 'Posts (0+)' })).toBeDefined()
  })
})
