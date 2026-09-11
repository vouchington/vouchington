import { Skeleton } from '@/components/ui/skeleton'

export function NewsListSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Heading and filter bar */}
      <div className='flex items-center justify-between'>
        <Skeleton className='h-8 w-24' />
        <Skeleton className='h-9 w-64' />
      </div>
      {/* News item rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className='flex items-start gap-3'
        >
          <Skeleton className='h-20 w-32 shrink-0' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-5/6' />
            <Skeleton className='h-3 w-24' />
          </div>
        </div>
      ))}
    </div>
  )
}
