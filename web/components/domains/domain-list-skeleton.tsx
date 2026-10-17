import { Skeleton } from '@/components/ui/skeleton'

export function DomainListSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-5 w-48' />
      <div className='space-y-2'>
        <Skeleton className='h-8 w-40' />
        <Skeleton className='h-4 w-80 max-w-full' />
      </div>
      <Skeleton className='h-9 w-full max-w-xl' />
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className='space-y-2 rounded-md border bg-card p-4'
        >
          <Skeleton className='h-6 w-1/2' />
          <Skeleton className='h-4 w-48' />
        </div>
      ))}
    </div>
  )
}
