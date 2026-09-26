import { useState } from 'react'
import type { ScopeCatalogEntry } from '@/types/scopes'
import {
  RSS_KEY_SCOPES,
  scopeResourceRows,
  toggleScope,
  type ApiKeyAudience,
  type ScopeResourceRow,
} from './scope-selection'

export type ApiKeyType = 'mcp' | 'rss'

export interface ApiKeyScopeSelection {
  keyType: ApiKeyType
  audience: ApiKeyAudience
  rows: ScopeResourceRow[]
  mcpScopes: readonly string[]
  /** The scopes the create request sends for the selected key type. */
  permissions: readonly string[]
  handleKeyTypeChange: (keyType: ApiKeyType) => void
  handleAudienceChange: (audience: ApiKeyAudience) => void
  handleScopeToggle: (scope: string, checked: boolean) => void
}

export function useApiKeyScopeSelection(catalog: readonly ScopeCatalogEntry[]) {
  const [keyType, setKeyType] = useState<ApiKeyType>('rss')
  const [audience, setAudience] = useState<ApiKeyAudience>('user')
  const [mcpScopes, setMcpScopes] = useState<string[]>([])

  const selection: ApiKeyScopeSelection = {
    keyType,
    audience,
    rows: scopeResourceRows(catalog, 'api-key', [audience]),
    mcpScopes,
    permissions: keyType === 'rss' ? RSS_KEY_SCOPES : mcpScopes,
    handleKeyTypeChange: setKeyType,
    // An MCP key holds one audience, so switching audience drops the other audience's scopes.
    handleAudienceChange: next => {
      setAudience(next)
      setMcpScopes([])
    },
    handleScopeToggle: (scope, checked) =>
      setMcpScopes(prev => toggleScope(catalog, prev, scope, checked)),
  }

  function reset() {
    setKeyType('rss')
    setAudience('user')
    setMcpScopes([])
  }

  return { selection, reset }
}
