import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CreateApiKeyForm } from '@/components/my/api-keys-manager/create-api-key-form'
import {
  RSS_KEY_SCOPES,
  scopeResourceGroups,
  toggleScope,
} from '@/components/my/api-keys-manager/scope-selection'
import type {
  ApiKeyScopeSelection,
  ApiKeyType,
} from '@/components/my/api-keys-manager/use-api-key-scope-selection'
import { StoryFrame } from '@/storybook/story-frame'
import { storybookScopeCatalog } from '../fixtures/scope-catalog'

const meta = { title: 'My/Create Api Key Form' } satisfies Meta
export default meta
type Story = StoryObj<typeof meta>
const noop = () => {}

function StatefulForm({
  initialLabel,
  initialKeyType,
  initialScopes,
  initialAudience = 'user',
  submitting,
}: {
  initialLabel: string
  initialKeyType: ApiKeyType
  initialScopes: string[]
  initialAudience?: NonNullable<ApiKeyScopeSelection['audience']>
  submitting: boolean
}) {
  const [label, setLabel] = useState(initialLabel)
  const [keyType, setKeyType] = useState(initialKeyType)
  const [mcpScopes, setMcpScopes] = useState(initialScopes)
  const [audience, setAudience] = useState<ApiKeyScopeSelection['audience']>(initialAudience)
  const selection: ApiKeyScopeSelection = {
    keyType,
    audiences: ['user', 'community_moderation', 'brand'],
    audience,
    groups: audience ? scopeResourceGroups(storybookScopeCatalog, 'api-key', [audience]) : [],
    mcpScopes,
    permissions: keyType === 'rss' ? RSS_KEY_SCOPES : mcpScopes,
    handleKeyTypeChange: setKeyType,
    handleAudienceChange: next => {
      setAudience(next)
      setMcpScopes([])
    },
    handleScopeToggle: (scope, checked) =>
      setMcpScopes(prev => toggleScope(storybookScopeCatalog, prev, scope, checked)),
  }
  return (
    <StoryFrame width='max-w-xl'>
      <CreateApiKeyForm
        isAdministrator={false}
        lifetimeDays={90}
        setLifetimeDays={noop}
        label={label}
        selection={selection}
        submitting={submitting}
        onCancel={noop}
        onCreate={noop}
        setLabel={setLabel}
      />
    </StoryFrame>
  )
}

export const RssReader: Story = {
  render: () => (
    <StatefulForm
      initialLabel='Fintech Daily reader'
      initialKeyType='rss'
      initialScopes={[]}
      submitting={false}
    />
  ),
}

export const Submitting: Story = {
  render: () => (
    <StatefulForm
      initialLabel='Points notebook MCP'
      initialKeyType='mcp'
      initialScopes={['mcp.user:read']}
      submitting
    />
  ),
}

export const BrandServer: Story = {
  render: () => (
    <StatefulForm
      initialLabel='Topic claims agent'
      initialKeyType='mcp'
      initialAudience='brand'
      initialScopes={['topic-claims:read']}
      submitting={false}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('combobox', { name: 'MCP server' })).toHaveValue('brand')
    await expect(canvas.getByRole('checkbox', { name: 'topic-claims Read' })).toBeChecked()
  },
}
