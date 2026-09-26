import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { API_KEY_PRESETS } from '@/components/my/api-keys-manager/api-key-presets'
import { CreateApiKeyForm } from '@/components/my/api-keys-manager/create-api-key-form'
import { StoryFrame } from '@/storybook/story-frame'

const meta = {
  title: 'My/Create Api Key Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const presets = API_KEY_PRESETS.filter(preset => preset.adminOnly !== true)

export const RssReader: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CreateApiKeyForm
        label='Fintech Daily reader'
        presets={presets}
        selectedPresetId='rss-read'
        submitting={false}
        onCancel={() => {}}
        onCreate={() => {}}
        setLabel={() => {}}
        setSelectedPresetId={() => {}}
      />
    </StoryFrame>
  ),
}

export const Submitting: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CreateApiKeyForm
        label='Points notebook MCP'
        presets={presets}
        selectedPresetId='user-mcp-read'
        submitting
        onCancel={() => {}}
        onCreate={() => {}}
        setLabel={() => {}}
        setSelectedPresetId={() => {}}
      />
    </StoryFrame>
  ),
}
