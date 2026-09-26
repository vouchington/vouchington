import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ClientSearchForm } from '@/components/shared/client-search-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Shared/Client Search Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const WithQuery: Story = {
  render: () => (
    <StoryFrame>
      <ClientSearchForm
        searchParamName='q'
        label='Search topics'
        placeholder='Search Open Banking, Sapphire Reserve'
        defaultValue='Open Banking'
        buttonLabel='Search'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <ClientSearchForm
        searchParamName='q'
        label='Search topics'
        placeholder='Search Open Banking, Sapphire Reserve'
      />
    </StoryFrame>
  ),
}
