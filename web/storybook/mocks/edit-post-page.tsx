import { Card } from '@/components/ui/card'

export function EditPostPage() {
  return (
    <Card
      className='p-4'
      data-pw='edit-post-page-mock'
    >
      <h2 className='text-sm font-semibold'>Edit post</h2>
      <p className='mt-1 text-sm text-muted-foreground'>Storybook-safe edit form placeholder</p>
    </Card>
  )
}
