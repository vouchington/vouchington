import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { CreateApiKeyForm } from '@/components/my/api-keys-manager/create-api-key-form'
import {
  RSS_KEY_SCOPES,
  scopeResourceRows,
  toggleScope,
  type ApiKeyAudience,
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
  initialAudience,
  initialScopes,
  showAudience,
  submitting,
}: {
  initialLabel: string
  initialKeyType: ApiKeyType
  initialAudience: ApiKeyAudience
  initialScopes: string[]
  showAudience: boolean
  submitting: boolean
}) {
  const [label, setLabel] = useState(initialLabel)
  const [keyType, setKeyType] = useState(initialKeyType)
  const [audience, setAudience] = useState(initialAudience)
  const [mcpScopes, setMcpScopes] = useState(initialScopes)
  const selection: ApiKeyScopeSelection = {
    keyType,
    audience,
    rows: scopeResourceRows(storybookScopeCatalog, 'api-key', [audience]),
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
        label={label}
        selection={selection}
        showAudience={showAudience}
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
      initialAudience='user'
      initialScopes={[]}
      showAudience
      submitting={false}
    />
  ),
}

export const Submitting: Story = {
  render: () => (
    <StatefulForm
      initialLabel='Points notebook MCP'
      initialKeyType='mcp'
      initialAudience='user'
      initialScopes={['mcp.user:read']}
      showAudience
      submitting
    />
  ),
}
