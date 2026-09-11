import { Card } from '@/components/ui/card'

export function TopicCategoryTagsAside() {
  return <TopicTagAsideMock title='Categories' />
}

export function TopicPublisherTypesAside() {
  return <TopicTagAsideMock title='Publisher Type' />
}

function TopicTagAsideMock({ title }: { title: string }) {
  return (
    <Card
      className='p-4'
      data-pw='topic-tag-aside-mock'
    >
      <h3 className='text-sm font-semibold'>{title}</h3>
      <p className='mt-1 text-sm text-muted-foreground'>Storybook-safe topic tag placeholder</p>
    </Card>
  )
}
