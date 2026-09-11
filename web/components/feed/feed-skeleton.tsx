import { Skeleton } from '@/components/ui/skeleton'

export function FeedSkeleton() {
  return (
    <div
      data-pw='feed-skeleton'
      className='space-y-4'
    >
      <Skeleton className='h-9 w-48' />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className='h-24 w-full'
        />
      ))}
    </div>
  )
}
