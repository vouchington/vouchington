import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'

const meta = {
  title: 'Shared/EntityBookmarkButton',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto flex max-w-3xl flex-col gap-5 rounded-md border p-4'>{children}</div>
  </main>
)

export const SingleButton: Story = {
  render: () => (
    <Frame>
      <EntityBookmarkButton
        entityType='topic'
        entityId='storybook-topic'
        preset='subscribe'
        initialActive={false}
      />
    </Frame>
  ),
}

export const MultipleButtonsSameEntity: Story = {
  render: () => (
    <Frame>
      <p className='text-sm text-muted-foreground'>
        Three bookmark buttons sharing the same entity — toggling one only triggers a refetch for
        other buttons with the same predicate; buttons for different predicates are unaffected.
      </p>
      <EntityBookmarkButton
        entityType='user'
        entityId='storybook-user'
        predicate='follow'
        inactiveLabel='Follow'
        activeLabel='Following'
        initialActive={false}
      />
      <EntityBookmarkButton
        entityType='user'
        entityId='storybook-user'
        predicate='subscribe'
        inactiveLabel='Subscribe to Posts'
        activeLabel='Subscribed to Posts'
        initialActive={false}
      />
      <EntityBookmarkButton
        entityType='user'
        entityId='storybook-user'
        preset='mute'
        initialActive={false}
      />
    </Frame>
  ),
}
