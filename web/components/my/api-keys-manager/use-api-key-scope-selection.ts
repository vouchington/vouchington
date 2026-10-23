import { useState } from 'react'
import type { McpScopeAudience, ScopeCatalogResponse } from '@/types/scopes'
import {
  RSS_KEY_SCOPES,
  availableScopeAudiences,
  scopeResourceGroups,
  toggleScope,
  type ScopeResourceGroup,
} from './scope-selection'

export type ApiKeyType = 'mcp' | 'rss'

export interface ApiKeyScopeSelection {
  keyType: ApiKeyType
  audiences: McpScopeAudience[]
  audience: McpScopeAudience | null
  groups: ScopeResourceGroup[]
  mcpScopes: readonly string[]
  /** The scopes the create request sends for the selected key type. */
  permissions: readonly string[]
  handleKeyTypeChange: (keyType: ApiKeyType) => void
  handleAudienceChange: (audience: McpScopeAudience) => void
  handleScopeToggle: (scope: string, checked: boolean) => void
}

export function useApiKeyScopeSelection(catalog: ScopeCatalogResponse, isAdministrator: boolean) {
  const [keyType, setKeyType] = useState<ApiKeyType>('rss')
  const [mcpScopes, setMcpScopes] = useState<string[]>([])
  const [chosenAudience, setChosenAudience] = useState<McpScopeAudience | null>(null)
  const audiences = availableScopeAudiences(catalog.audiences, 'api-key', isAdministrator)
  const audience =
    chosenAudience && audiences.includes(chosenAudience) ? chosenAudience : (audiences[0] ?? null)
  const selectedScopes = mcpScopes.filter(scope =>
    catalog.scopes.some(entry => entry.scope === scope && entry.audience === audience),
  )

  const selection: ApiKeyScopeSelection = {
    keyType,
    audiences,
    audience,
    groups: audience ? scopeResourceGroups(catalog.scopes, 'api-key', [audience]) : [],
    mcpScopes: selectedScopes,
    permissions: keyType === 'rss' ? RSS_KEY_SCOPES : selectedScopes,
    handleKeyTypeChange: setKeyType,
    handleAudienceChange: nextAudience => {
      if (!audiences.includes(nextAudience)) return
      setChosenAudience(nextAudience)
      setMcpScopes([])
    },
    handleScopeToggle: (scope, checked) =>
      setMcpScopes(prev =>
        catalog.scopes.some(entry => entry.scope === scope && entry.audience === audience)
          ? toggleScope(catalog.scopes, prev, scope, checked)
          : prev,
      ),
  }

  function resetSelection() {
    setKeyType('rss')
    setMcpScopes([])
    setChosenAudience(null)
  }

  return { selection, resetSelection }
}
