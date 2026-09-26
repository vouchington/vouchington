import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import type { ReactNode } from 'react'
import { fn } from 'storybook/test'
import { ChoiceRadioGroup } from '@/components/my/api-keys-manager/choice-radio-group'
import { CreateApiKeyForm } from '@/components/my/api-keys-manager/create-api-key-form'
import { ScopePicker } from '@/components/my/api-keys-manager/scope-picker'
import { scopeResourceRows } from '@/components/my/api-keys-manager/scope-selection'
import type { ApiKeyScopeSelection } from '@/components/my/api-keys-manager/use-api-key-scope-selection'
import { storybookScopeCatalog } from './scope-catalog-fixture'

const meta = {
  title: 'My/API Keys',
  parameters: { layout: 'centered' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function selection(overrides: Partial<ApiKeyScopeSelection>): ApiKeyScopeSelection {
  return {
    keyType: 'rss',
    audience: 'user',
    rows: scopeResourceRows(storybookScopeCatalog, 'api-key', ['user']),
    mcpScopes: [],
    permissions: ['rss:read'],
    handleKeyTypeChange: fn(),
    handleAudienceChange: fn(),
    handleScopeToggle: fn(),
    ...overrides,
  }
}

function Frame({ children }: { children: ReactNode }) {
  return <div className='w-[min(92vw,640px)]'>{children}</div>
}

export const CreateRssKey: Story = {
  render: () => (
    <Frame>
      <CreateApiKeyForm
        label='Feed reader'
        selection={selection({})}
        showAudience={false}
        submitting={false}
        onCancel={fn()}
        onCreate={fn()}
        setLabel={fn()}
      />
    </Frame>
  ),
}

export const CreateAdminMcpKey: Story = {
  render: () => (
    <Frame>
      <CreateApiKeyForm
        label='Admin agent'
        selection={selection({
          keyType: 'mcp',
          audience: 'admin',
          rows: scopeResourceRows(storybookScopeCatalog, 'api-key', ['admin']),
          mcpScopes: ['mcp.admin:read', 'mcp.admin:write'],
          permissions: ['mcp.admin:read', 'mcp.admin:write'],
        })}
        showAudience
        submitting={false}
        onCancel={fn()}
        onCreate={fn()}
        setLabel={fn()}
      />
    </Frame>
  ),
}

export const ScopePickerWithSelection: Story = {
  render: () => (
    <Frame>
      <ScopePicker
        idPrefix='storybook'
        rows={scopeResourceRows(storybookScopeCatalog, 'api-key', ['user'])}
        selected={['mcp.user:read', 'cards:read', 'cards:write']}
        onToggle={fn()}
      />
    </Frame>
  ),
}

export const RadioChoices: Story = {
  render: () => (
    <Frame>
      <ChoiceRadioGroup
        idPrefix='storybook-choice'
        legend='Key type'
        options={[
          { value: 'rss', label: 'RSS feed', dataPw: 'storybook-choice-rss' },
          { value: 'mcp', label: 'MCP server', dataPw: 'storybook-choice-mcp' },
        ]}
        value='mcp'
        onChange={fn()}
      />
    </Frame>
  ),
}
