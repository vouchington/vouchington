import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { BrowsePageHeader } from '@/components/shared/browse-page-header'

const meta = {
  title: 'Shared/BrowsePageHeader',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl space-y-8'>{children}</div>
  </main>
)

export const News: Story = {
  render: () => (
    <Frame>
      <BrowsePageHeader
        routeKey='news'
        titleClassName='text-2xl tracking-tight'
      />
    </Frame>
  ),
}

export const NewsSourcesDefault: Story = {
  render: () => (
    <Frame>
      <BrowsePageHeader routeKey='news-sources' />
    </Frame>
  ),
}

export const Podcasts: Story = {
  render: () => (
    <Frame>
      <BrowsePageHeader routeKey='podcasts' />
    </Frame>
  ),
}
