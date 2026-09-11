import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function AsideSkeleton() {
  return (
    <Card className='p-4'>
      <Skeleton className='mb-3 h-4 w-24' />
      <div className='space-y-2'>
        <Skeleton className='h-3 w-full' />
        <Skeleton className='h-3 w-3/4' />
        <Skeleton className='h-3 w-1/2' />
      </div>
    </Card>
  )
}
