import { Card } from '@/components/ui/card'

export function AgentDetail() {
  return (
    <Card
      className='p-4'
      data-pw='agent-detail-heading'
    >
      <h2 className='text-sm font-semibold'>Agent detail</h2>
      <p className='mt-1 text-sm text-muted-foreground'>Storybook-safe agent detail placeholder</p>
    </Card>
  )
}
