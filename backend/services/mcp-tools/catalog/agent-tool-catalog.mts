import type { Tool } from '@services/openai-agents/tool-types'

const CATALOG_BEGIN = '<!-- BEGIN GENERATED -->'
const CATALOG_END = '<!-- END GENERATED -->'

export function renderCatalogTable(tools: readonly Tool[]): string {
  const rows = tools.map(tool => {
    const surfaces = tool.meta?.surfaces ?? ['internal']
    const cells = [
      `\`${tool.schema.name}\``,
      tool.meta?.title ?? '—',
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
    '| Tool | Title | Description | Surfaces | Plan | Required scopes | Hints | REST Equivalent |',
    '| ---- | ----- | ----------- | -------- | ---- | --------------- | ----- | --------------- |',
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

function declaredScopes(tool: Tool): string[] {
  const perSurface = Object.values(tool.meta?.requiredScopes ?? {})
  return [...new Set(perSurface.flatMap(scopes => scopes ?? []))]
}

function hintLabel(tool: Tool): string {
  const annotations = tool.meta?.annotations
  if (annotations === undefined) return '—'
  if (annotations.readOnlyHint) return 'read-only'
  const { destructiveHint, idempotentHint } = annotations
  return ['write', destructiveHint && 'destructive', idempotentHint && 'idempotent']
    .filter(Boolean)
    .join(', ')
}

function tableCell(value: string): string {
  return value
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replaceAll('|', String.raw`\|`)
}
