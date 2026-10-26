import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { navMockModule } from 'vouchington-tooling/next-navigation-mock'
import { topicRouteConfigs } from '@/lib/route-configs'

const { notFound, mockGetFlag, mockTopicListPage } = vi.hoisted(() => ({
  notFound: vi.fn<() => never>(),
  mockGetFlag: vi.fn<(name: string) => Promise<boolean>>(),
  mockTopicListPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/navigation'), () => ({ ...navMockModule, notFound }))

vi.mock(import('@/lib/feature-flags/server'), () => ({
  getEffectiveServerFeatureFlag: mockGetFlag,
}))

vi.mock(import('@/components/topics/topic-list-page'), () => ({
  TopicListPage: mockTopicListPage,
}))

vi.mock(import('@/lib/api/server/fediverse'), () => ({
  getFediverseInstances: vi.fn<VitestLooseMock>(),
}))

import InstancesPage from './page'

describe('InstancesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    notFound.mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })
    mockGetFlag.mockResolvedValue(false)
    mockTopicListPage.mockReturnValue(<div>instances list</div>)
  })

  it('renders the list from the streamed page when the fediverse flag is off', async () => {
    const ui = await InstancesPage({ searchParams: Promise.resolve({}) })

    expect(notFound).not.toHaveBeenCalled()
    expect(mockGetFlag).not.toHaveBeenCalled()
    render(ui)
    expect(screen.getByText('instances list')).toBeInTheDocument()
    expect(mockTopicListPage).toHaveBeenCalledWith(
      expect.objectContaining({
        config: topicRouteConfigs.instances,
        includeTopicTypeFilter: false,
        normalizeFediversePages: true,
        nextPageEndpoint: '/api/v1/fediverse/instances',
      }),
      undefined,
    )
  })
})
