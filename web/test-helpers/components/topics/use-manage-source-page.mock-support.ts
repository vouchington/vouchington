import { vi } from 'vitest'

vi.mock(import('@/lib/api/client'), () => ({
  deleteRssFeed: vi.fn<VitestLooseMock>(),
  getRssFeedCrawls: vi.fn<VitestLooseMock>(),
  refreshRssFeed: vi.fn<VitestLooseMock>(),
  updateRssFeed: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topics'), () => ({
  fetchRssFeeds: vi.fn<VitestLooseMock>(),
  fetchTopic: vi.fn<VitestLooseMock>(),
  updateTopic: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/topic-additional-hostnames'), () => ({
  addAdditionalHostname: vi.fn<VitestLooseMock>(),
  fetchAdditionalHostnames: vi.fn<VitestLooseMock>(),
  removeAdditionalHostname: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

export { toastMock }
