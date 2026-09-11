import { Skeleton } from '@/components/ui/skeleton'

export function TopicListSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Breadcrumb bar */}
      <Skeleton className='h-5 w-48' />
      {/* Heading and filter bar */}
      <div className='flex items-center justify-between'>
        <Skeleton className='h-8 w-36' />
        <Skeleton className='h-9 w-64' />
      </div>
      {/* Topic cards */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className='flex items-center gap-3'
        >
          <Skeleton className='h-10 w-10 rounded-full' />
          <div className='flex-1 space-y-2'>
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-3 w-full' />
          </div>
        </div>
      ))}
    </div>
  )
}
