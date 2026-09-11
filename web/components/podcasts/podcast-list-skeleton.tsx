import { Skeleton } from '@/components/ui/skeleton'

export function PodcastListSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-5 w-48' />
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='space-y-2'>
          <Skeleton className='h-8 w-32' />
          <Skeleton className='h-4 w-80 max-w-full' />
        </div>
        <Skeleton className='h-9 w-28' />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className='h-28 w-full'
        />
      ))}
    </div>
  )
}
