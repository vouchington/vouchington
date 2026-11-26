import { vi } from 'vitest'

const { receiveLoadMore } = vi.hoisted(() => ({
  receiveLoadMore: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getPaginatedPage: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/shared/infinite-scroll'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    InfiniteScroll: (props: Parameters<typeof actual.InfiniteScroll>[0]) => {
      receiveLoadMore(props.onLoadMore)
      return <actual.InfiniteScroll {...props} />
    },
  }
})

export { receiveLoadMore }
