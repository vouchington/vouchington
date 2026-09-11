import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreateApiKeyForm } from '@/components/my/api-keys-manager/create-api-key-form'
import { API_KEY_PRESETS } from '@/components/my/api-keys-manager/api-key-presets'

const meta = {
  title: 'My/API Keys',
  component: CreateApiKeyForm,
} satisfies Meta<typeof CreateApiKeyForm>

export default meta
type Story = StoryObj<typeof meta>

export const CreateFormAdmin: Story = {
  args: {
    label: 'Claude admin MCP',
    presets: API_KEY_PRESETS,
    selectedPresetId: 'admin-mcp-write',
    submitting: false,
  },
}
