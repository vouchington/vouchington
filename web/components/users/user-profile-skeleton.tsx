import { Skeleton } from '@/components/ui/skeleton'

export function UserProfileSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-4 w-40' />
      <div className='flex items-center gap-4'>
        <Skeleton className='h-16 w-16 rounded-full' />
        <div className='flex-1 space-y-2'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-24' />
        </div>
      </div>
      <Skeleton className='h-9 w-full' />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton
          key={i}
          className='h-20 w-full'
        />
      ))}
    </div>
  )
}
