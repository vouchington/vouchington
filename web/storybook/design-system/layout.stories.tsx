import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ContentContainer } from '@/components/layout/content-container'
import { HoverableCard } from '@/components/shared/hoverable-card'
import { PageHeader } from '@/components/shared/page-header'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'

const meta = {
  title: 'Design System/Layout',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const Frame = ({ children }: { children: React.ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>{children}</main>
)

export const PageHeaderDefault: Story = {
  render: () => (
    <Frame>
      <PageHeader title='Discussions' />
    </Frame>
  ),
}

export const PageHeaderWithDescription: Story = {
  render: () => (
    <Frame>
      <PageHeader
        title='Topics'
        description='Browse all topics available on the platform.'
      />
    </Frame>
  ),
}

export const ContentContainerDefault: Story = {
  render: () => (
    <Frame>
      <ContentContainer className='border border-dashed p-4'>
        <p className='text-muted-foreground'>Content column — max 1200px, centred.</p>
      </ContentContainer>
    </Frame>
  ),
}

export const HoverableCardDefault: Story = {
  render: () => (
    <Frame>
      <div className='max-w-sm'>
        <HoverableCard>
          <h2 className='text-base font-semibold'>Shared interactive card</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Reused by topic, post, community, and home-preview card shells.
          </p>
        </HoverableCard>
      </div>
    </Frame>
  ),
}

export const PaginatedListFooterNormal: Story = {
  render: () => (
    <Frame>
      <PaginatedListFooter
        fetchError={null}
        canLoadMore
        loadingMore={false}
        clearError={() => undefined}
        loadMore={() => undefined}
      />
    </Frame>
  ),
}

export const PaginatedListFooterLoading: Story = {
  render: () => (
    <Frame>
      <PaginatedListFooter
        fetchError={null}
        canLoadMore
        loadingMore
        clearError={() => undefined}
        loadMore={() => undefined}
      />
    </Frame>
  ),
}

export const PaginatedListFooterRetry: Story = {
  render: () => (
    <Frame>
      <PaginatedListFooter
        fetchError={new Error('Network error')}
        canLoadMore
        loadingMore={false}
        clearError={() => undefined}
        loadMore={() => undefined}
      />
    </Frame>
  ),
}

export const PaginatedListFooterTerminal: Story = {
  render: () => (
    <Frame>
      <p className='text-muted-foreground'>The terminal page has no continuation control.</p>
      <PaginatedListFooter
        fetchError={null}
        canLoadMore={false}
        loadingMore={false}
        clearError={() => undefined}
        loadMore={() => undefined}
      />
    </Frame>
  ),
}

export const PaginatedListFooterHidden: Story = PaginatedListFooterTerminal
