import '@/test-helpers/components/shared/markdown-highlighter.mock-support'
/* oxlint-disable no-mistakes/playwright-unique -- two follower-share-actions doubles share one literal id */
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'
import type { User } from '@/types/user'
import { DataPw } from '@/components/shared/data-pw'

const mockPostCardUser: { current: User | null } = { current: null }
const mockUseEmblaCarousel = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('next/dynamic'),
  () =>
    ({
      default: (loader: () => Promise<unknown>) => {
        const src = loader.toString()
        if (src.includes('follower-share-actions'))
          return () => <div data-pw='follower-share-actions' />
        if (src.includes('report-menu-item'))
          return ({ 'data-pw': dataPw }: { 'data-pw'?: string }) => (
            <DataPw
              dataPw={dataPw}
              as={Button}
              type='button'
            >
              Report
            </DataPw>
          )
        return () => null
      },
    }) as unknown as typeof import('next/dynamic'),
)

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-pw='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/entity-bookmark-button'), () => ({
  EntityBookmarkButton: () => <Button type='button'>Save</Button>,
}))

vi.mock(import('@/components/shared/post-image'), () => {
  const Img = 'img' as const
  return {
    PostImage: ({ alt, priority }: { alt?: string; priority?: boolean }) => (
      <Img
        alt={alt}
        data-priority={String(Boolean(priority))}
      />
    ),
  }
})

vi.mock(import('@/lib/api/client/elections'), async importOriginal => ({
  ...(await importOriginal()),
  clearPostVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
  submitPostVote: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
}))

vi.mock(
  import('embla-carousel-react'),
  () =>
    ({
      default: mockUseEmblaCarousel,
    }) as unknown as typeof import('embla-carousel-react'),
)

vi.mock(import('@/components/shared/follower-share-actions'), () => ({
  FollowerShareActions: () => <div data-pw='follower-share-actions' />,
}))

vi.mock(import('@/components/shared/shared-byline'), () => ({
  SharedByline: ({ className }: { className?: string }) => (
    <div
      data-pw='shared-byline'
      data-class={className ?? ''}
    />
  ),
}))

function resetPostCardRenderingDoubles() {
  mockPostCardUser.current = null
  mockUseEmblaCarousel.mockReturnValue([
    vi.fn<VitestLooseMock>(),
    {
      canScrollPrev: () => false,
      canScrollNext: () => false,
      scrollPrev: vi.fn<VitestLooseMock>(),
      scrollNext: vi.fn<VitestLooseMock>(),
      on: vi.fn<VitestLooseMock>(),
      off: vi.fn<VitestLooseMock>(),
    },
  ])
}

export { mockPostCardUser, resetPostCardRenderingDoubles }
