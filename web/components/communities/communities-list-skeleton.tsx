import { Skeleton } from '@/components/ui/skeleton'

export function CommunitiesListSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-8 w-48' />
      <Skeleton className='h-9 w-full' />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className='h-20 w-full'
        />
      ))}
    </div>
  )
}
