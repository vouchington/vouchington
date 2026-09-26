import { listToolsForSurface } from '@voucha/tools/registry/select'
import type { Tool, ToolApiEndpoint } from '@voucha/tools/types'

const CATALOG_BEGIN = '<!-- BEGIN GENERATED -->'
const CATALOG_END = '<!-- END GENERATED -->'

export type ClientToolManifest = {
  tools: {
    name: string
    description: string | null
    parameters: null
    api: readonly ToolApiEndpoint[] | null
    requiredScopes: string[]
  }[]
}

export function renderCatalogTable(tools: readonly Tool[]): string {
  const rows = tools.map(tool => {
    const surfaces = tool.meta?.surfaces ?? ['internal']
    const cells = [
      `\`${tool.schema.name}\``,
      tableCell(tool.schema.description ?? '—'),
      surfaces.join(', '),
      // Plan gating applies only at the user `mcp` dispatch boundary (see ToolMeta.plan).
      surfaces.includes('mcp') ? (tool.meta?.plan ?? 'free') : '—',
      declaredScopes(tool).join(', ') || '—',
      hintLabel(tool),
      tool.meta?.api?.map(({ method, path }) => `\`${method} ${path}\``).join(', ') ?? '—',
    ]
    return `| ${cells.join(' | ')} |`
  })
  return [
    '| Tool | Description | Surfaces | Plan | Required scopes | Hint | REST Equivalent |',
    '| ---- | ----------- | -------- | ---- | --------------- | ---- | --------------- |',
    ...rows,
  ].join('\n')
}

export function spliceCatalogTable(markdown: string, table: string): string {
  const beginIndex = markdown.indexOf(CATALOG_BEGIN)
  const endIndex = markdown.indexOf(CATALOG_END)
  if (beginIndex === -1 || endIndex === -1)
    throw new Error(`The agent tool catalog is missing ${CATALOG_BEGIN} / ${CATALOG_END} markers`)
  const before = markdown.slice(0, beginIndex + CATALOG_BEGIN.length)
  return `${before}\n\n${table}\n\n${markdown.slice(endIndex)}`
}

export function buildClientManifest(tools: readonly Tool[]): ClientToolManifest {
  return {
    tools: listToolsForSurface('client', tools).map(tool => ({
      name: tool.schema.name,
      description: tool.schema.description ?? null,
      parameters: null,
      api: tool.meta?.api ?? null,
      requiredScopes: declaredScopes(tool),
    })),
  }
}

function declaredScopes(tool: Tool): string[] {
  const perSurface = Object.values(tool.meta?.requiredScopes ?? {})
  return [...new Set(perSurface.flatMap(scopes => scopes ?? []))]
}

function hintLabel(tool: Tool): string {
  if (tool.meta?.annotations?.readOnlyHint === true) return 'read-only'
  if (tool.meta?.annotations?.destructiveHint === true) return 'mutating'
  return '—'
}

function tableCell(value: string): string {
  return value
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replaceAll('|', String.raw`\|`)
}
