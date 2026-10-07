import { isDeepStrictEqual } from 'node:util'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import type { Tool } from '@services/openai-agents/tool-types'
import type { McpToolShape } from '@voucha/mcp/registry/adapters'
import { isToolMcpEligible, listToolsForSurface } from '@voucha/mcp/registry/select'
import {
  ADMIN_MCP_SERVER_CONFIG,
  USER_MCP_SERVER_CONFIG,
  type McpServerConfig,
} from '../config.mts'
import { buildMcpCatalog } from './build-mcp-catalog.mts'
import { findApiHintConflicts } from './find-api-hint-conflicts.mts'

type CatalogCaller = { id: string; roles: string[]; membership_plan: 'pro' }
type ListTools = (
  user: CatalogCaller,
  scopes: readonly ApiScope[],
  config: McpServerConfig,
  copyrightDecisionToolsEnabled: boolean,
) => McpToolShape[]

/** Validate the real registry against the actual tools/list boundary in static CI. */
export function findCatalogContractViolations(
  tools: readonly Tool[],
  listTools: ListTools,
  expectedCopyrightDecisionCount: number,
): string[] {
  const errors: string[] = []
  const catalog = buildMcpCatalog(tools)
  const catalogByName = new Map(catalog.servers.map(server => [server.name, server]))
  const caller: CatalogCaller = {
    id: 'mcp-catalog-check',
    roles: [...new Set(tools.flatMap(tool => Object.keys(tool.roles ?? {})))],
    membership_plan: 'pro',
  }
  const scopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]

  for (const config of [USER_MCP_SERVER_CONFIG, ADMIN_MCP_SERVER_CONFIG]) {
    const listed = listTools(caller, scopes, config, true)
    const registered = listToolsForSurface(config.surface, tools).flatMap(tool =>
      isToolMcpEligible(tool) ? [tool.schema.name] : [],
    )
    const catalogTools = catalogByName.get(config.serverName)?.tools.map(entry => entry.tool)
    if (
      !isDeepStrictEqual(
        listed.map(tool => tool.name),
        registered,
      )
    )
      errors.push(`${config.serverName} tools/list differs from eligible registry tools`)
    if (!isDeepStrictEqual(catalogTools, listed))
      errors.push(`${config.serverName} catalog differs from tools/list`)
  }

  const enabled = listTools(caller, scopes, ADMIN_MCP_SERVER_CONFIG, true)
  const disabled = listTools(caller, scopes, ADMIN_MCP_SERVER_CONFIG, false)
  const decisions = tools.flatMap(tool =>
    tool.meta?.switch === 'copyright.mcpDecisionTools' ? [tool.schema.name] : [],
  )
  const decisionNames = new Set(decisions)
  if (decisions.length !== expectedCopyrightDecisionCount)
    errors.push(
      `Expected ${expectedCopyrightDecisionCount} copyright decision tools; found ${decisions.length}`,
    )
  if (
    !isDeepStrictEqual(
      enabled.flatMap(tool => (decisionNames.has(tool.name) ? [tool.name] : [])),
      decisions,
    )
  )
    errors.push('Enabled copyright decision tools differ from registry order')
  if (
    !isDeepStrictEqual(
      disabled.map(tool => tool.name),
      enabled.flatMap(tool => (decisionNames.has(tool.name) ? [] : [tool.name])),
    )
  )
    errors.push('Disabling copyright decision tools changed other admin tools')

  for (const { tool, conflict } of findApiHintConflicts(tools)) errors.push(`${tool}: ${conflict}`)
  const exposed = tools.filter(tool =>
    (tool.meta?.surfaces ?? []).some(surface => surface === 'mcp' || surface === 'admin_mcp'),
  )
  if (exposed.length === 0) errors.push('No MCP tools are exposed')
  for (const tool of exposed.filter(tool => !tool.meta?.outputSchema))
    errors.push(`${tool.schema.name}: missing registry output schema`)
  for (const { tool } of catalog.servers.flatMap(server => server.tools)) {
    if (!tool.outputSchema) errors.push(`${tool.name}: missing catalog output schema`)
    if (!tool.title?.trim()) errors.push(`${tool.name}: missing display title`)
  }
  return errors
}
