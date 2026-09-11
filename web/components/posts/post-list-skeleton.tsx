import { Skeleton } from '@/components/ui/skeleton'

export function PostListSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Breadcrumb bar */}
      <Skeleton className='h-5 w-48' />
      {/* Heading and filter bar */}
      <div className='flex items-center justify-between'>
        <Skeleton className='h-8 w-40' />
        <Skeleton className='h-9 w-64' />
      </div>
      {/* Content rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton
          key={i}
          className='h-24 w-full'
        />
      ))}
    </div>
  )
}
