import { Skeleton } from '@/components/ui/skeleton'

export function SettingsPageSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-8 w-40' />
      <Skeleton className='h-4 w-64' />
      <div className='space-y-3 pt-2'>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton
            key={i}
            className='h-12 w-full'
          />
        ))}
      </div>
    </div>
  )
}
