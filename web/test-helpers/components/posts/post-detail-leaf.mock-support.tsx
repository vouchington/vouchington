import { vi } from 'vitest'

vi.mock(
  import('@/components/shared/time-ago'),
  () =>
    ({
      TimeAgo: ({ date }: { date: string }) => <span>{date}</span>,
    }) as unknown as typeof import('@/components/shared/time-ago'),
)

vi.mock(import('@/components/shared/post-image'), () => {
  const Img = 'img' as const
  return {
    PostImage: ({
      alt,
      imageId,
      priority,
    }: {
      alt?: string
      imageId: string
      priority?: boolean
    }) => (
      <Img
        alt={alt}
        data-image-id={imageId}
        data-priority={String(Boolean(priority))}
      />
    ),
  }
})
