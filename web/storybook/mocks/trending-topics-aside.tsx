import { Card } from '@/components/ui/card'

export function TrendingTopicsAside() {
  return (
    <Card
      className='p-4'
      data-pw='trending-topics-aside'
    >
      <h3 className='mb-2 text-sm font-semibold'>Trending Topics</h3>
      <ul className='space-y-1.5 text-sm text-muted-foreground'>
        <li>Travel rewards</li>
        <li>Credit cards</li>
        <li>Airport lounges</li>
      </ul>
    </Card>
  )
}
