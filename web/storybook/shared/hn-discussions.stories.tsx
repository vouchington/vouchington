import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HnDiscussionsAside } from '@/components/asides/hn-discussions-aside'
import { HnDiscussionsPreference } from '@/components/my/hn-discussions-preference'
import { expect } from 'storybook/test'
import {
  getHnDiscussionsStoryResponse,
  waitForHnDiscussionTitle,
} from '@/test-helpers/hn-discussions-story-fixture'

const meta = {
  title: 'Shared/HnDiscussions',
  beforeEach() {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (input, init) => {
      const response = getHnDiscussionsStoryResponse(input)
      return response ? Promise.resolve(response) : originalFetch.call(globalThis, input, init)
    }
    return () => {
      globalThis.fetch = originalFetch
    }
  },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl space-y-6'>{children}</div>
  </main>
)

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
      <HnDiscussionsAside
        enabled
        urls={['https://example.com/story']}
      />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const title = await waitForHnDiscussionTitle(canvasElement)
    await expect(title).toHaveTextContent('Show HN: Community discussion')
    await expect(title).toHaveAttribute('href', 'https://news.ycombinator.com/item?id=424242')
  },
}
