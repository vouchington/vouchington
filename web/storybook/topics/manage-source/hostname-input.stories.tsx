import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { HostnameInput } from '@/components/topics/manage-source/hostname-input'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'Topics/Hostname Input',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const PrimaryDomain: Story = {
  render: () => (
    <StoryFrame>
      <HostnameInput
        id='primary-hostname'
        name='primaryHostname'
        label='Primary domain'
        placeholder='fintech.example'
        value='fintech.example'
      />
    </StoryFrame>
  ),
}

export const Empty: Story = {
  render: () => (
    <StoryFrame>
      <HostnameInput
        id='additional-hostname'
        name='additionalHostname'
        label='Additional domain'
        placeholder='americanexpress.com'
      />
    </StoryFrame>
  ),
}
