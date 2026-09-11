import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  HnDiscussionsAside,
  HnDiscussionsAsideContent,
} from '@/components/asides/hn-discussions-aside'
import { HnDiscussionsPreference } from '@/components/my/hn-discussions-preference'
import type { HnDiscussionThread } from '@/lib/hn-discussions/search'

const meta = {
  title: 'Shared/HnDiscussions',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl space-y-6'>{children}</div>
  </main>
)

const storyThreads: HnDiscussionThread[] = [
  {
    objectID: '424242',
    title: 'Show HN: A points card with no annual fee',
    score: 312,
    commentCount: 147,
    itemUrl: 'https://news.ycombinator.com/item?id=424242',
  },
  {
    objectID: '424243',
    title: 'Ask HN: Best travel card for Europe?',
    score: 88,
    commentCount: 63,
    itemUrl: 'https://news.ycombinator.com/item?id=424243',
  },
]

export const PreferenceOff: Story = {
  render: () => (
    <Frame>
      <h1 className='text-2xl font-bold'>Hacker News discussions</h1>
      <HnDiscussionsPreference
        initialEnabled={false}
        userId='storybook-user'
      />
      <HnDiscussionsAside
        enabled={false}
        urls={['https://example.com/story']}
      />
    </Frame>
  ),
}

export const PreferenceOn: Story = {
  render: () => (
    <Frame>
      <h1 className='text-2xl font-bold'>Hacker News discussions</h1>
      <HnDiscussionsPreference
        initialEnabled
        userId='storybook-user'
      />
    </Frame>
  ),
}

export const AsideWithThreads: Story = {
  render: () => (
    <Frame>
      <h1 className='text-2xl font-bold'>Related Hacker News threads</h1>
      <HnDiscussionsAsideContent threads={storyThreads} />
    </Frame>
  ),
}
