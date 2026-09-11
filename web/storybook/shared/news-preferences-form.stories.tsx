import type { ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { NewsPreferencesForm } from '@/components/my/news-preferences-form'
import type { Topic } from '@/types/topics'

const meta = {
  title: 'Shared/NewsPreferencesForm',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const makeType = (id: string, name: string, slug: string): Topic =>
  ({
    __entity_type: 'topic',
    id,
    name,
    slug,
    markdown: '',
    aliases: [],
    topic_type: 'mainstream-media',
    created_at: '2024-01-01T00:00:00.000Z',
    logo_image_id: null,
    hero_image_id: null,
    rewards_program_id: null,
    referral_program_id: null,
    created_by: { id: 'u1' },
    updated_by: { id: 'u1' },
  }) as unknown as Topic

const publisherTypes: Topic[] = [
  makeType('t1', 'Mainstream Media', 'mainstream-media'),
  makeType('t2', 'Corporate Media', 'corporate-media'),
  makeType('t3', 'Blog', 'blog'),
  makeType('t4', 'Aggregator', 'aggregator'),
  makeType('t5', 'Forum', 'forum'),
  makeType('t6', 'UGC', 'ugc-platform'),
  makeType('t7', 'Review', 'review'),
]

const Frame = ({ children }: { children: ReactNode }) => (
  <main className='min-h-screen bg-background p-6 text-foreground'>
    <div className='mx-auto max-w-3xl'>{children}</div>
  </main>
)

export const Default: Story = {
  render: () => (
    <Frame>
      <NewsPreferencesForm publisherTypes={publisherTypes} />
    </Frame>
  ),
}

export const Empty: Story = {
  render: () => (
    <Frame>
      <NewsPreferencesForm publisherTypes={[]} />
      <p className='text-sm text-muted-foreground'>
        (Empty — component renders nothing when no publisher types)
      </p>
    </Frame>
  ),
}
