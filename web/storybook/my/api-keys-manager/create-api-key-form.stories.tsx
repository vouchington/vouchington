import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreateApiKeyForm } from '@/components/my/api-keys-manager/create-api-key-form'
import { scopeResourceRows } from '@/components/my/api-keys-manager/scope-selection'
import type { ApiKeyScopeSelection } from '@/components/my/api-keys-manager/use-api-key-scope-selection'
import { StoryFrame } from '@/storybook/story-frame'
import { storybookScopeCatalog } from '../fixtures/scope-catalog'

const meta = {
  title: 'My/Create Api Key Form',
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const noop = () => {}

function selection(overrides: Partial<ApiKeyScopeSelection>): ApiKeyScopeSelection {
  return {
    keyType: 'rss',
    audience: 'user',
    rows: scopeResourceRows(storybookScopeCatalog, 'api-key', ['user']),
    mcpScopes: [],
    permissions: ['rss:read'],
    handleKeyTypeChange: noop,
    handleAudienceChange: noop,
    handleScopeToggle: noop,
    ...overrides,
  }
}

export const RssReader: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CreateApiKeyForm
        label='Fintech Daily reader'
        selection={selection({})}
        showAudience={false}
        submitting={false}
        onCancel={noop}
        onCreate={noop}
        setLabel={noop}
      />
    </StoryFrame>
  ),
}

export const Submitting: Story = {
  render: () => (
    <StoryFrame width='max-w-xl'>
      <CreateApiKeyForm
        label='Points notebook MCP'
        selection={selection({
          keyType: 'mcp',
          mcpScopes: ['mcp.user:read'],
          permissions: ['mcp.user:read'],
        })}
        showAudience={false}
        submitting
        onCancel={noop}
        onCreate={noop}
        setLabel={noop}
      />
    </StoryFrame>
  ),
}
