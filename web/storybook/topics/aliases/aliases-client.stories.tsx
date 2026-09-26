import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { AliasesClient } from '@/components/topics/aliases/aliases-client'
import { StoryFrame } from '@/storybook/story-frame'
import { topics } from '@/storybook/entities/fixtures/topics'

const topic = topics[0]!

const meta = {
  title: 'Topics/Aliases',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const CurrentAliases: Story = {
  render: () => (
    <StoryFrame>
      <AliasesClient
        topic={topic}
        initialData={{
          results: [
            { id: 'alias-slug', alias: topic.slug },
            { id: 'alias-open-banking-api', alias: 'open banking api' },
          ],
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        }}
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <AliasesClient
        topic={topic}
        initialData={{
          results: [],
          page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
        }}
      />
    </StoryFrame>
  ),
}
