import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '../..')
const TOOLS_DIR = path.join(ROOT, 'backend/tools')
const REGISTRY_FILE = path.join(TOOLS_DIR, 'registry/index.mts')

const BEGIN = '<!-- BEGIN GENERATED -->'
const END = '<!-- END GENERATED -->'

type ApiEndpoint = { method: string; path: string }

type ToolPlan = 'free' | 'plus' | 'pro'

type ToolEntry = {
  name: string
  description: string | null
  surfaces: string[]
  requiredScopes: string[]
  readOnlyHint: boolean
  destructiveHint: boolean
  api: ApiEndpoint[] | null
  parameters: unknown
  // Minimum mcp-surface plan; null defaults to 'free' at runtime (see types.mts#ToolMeta.plan).
  plan: ToolPlan | null
}

function getToolFilePaths(): string[] {
  const src = readFileSync(REGISTRY_FILE, 'utf8')
  const importRe = /^import\s+\w+\s+from\s+'(\.\.\/[^']+)'/gm
  const paths: string[] = []
  let m: RegExpExecArray | null
  while ((m = importRe.exec(src)) !== null) {
    const rel = `${m[1].replace(/\.mts$/, '')}.mts`
    paths.push(path.join(TOOLS_DIR, 'registry', rel))
  }
  return paths
}

function extractNameField(src: string, key: string): string | null {
  const re = new RegExp(`${key}:\\s*'([^']+)'`)
  const m = re.exec(src)
  return m ? m[1] : null
}

function extractDescription(src: string): string | null {
  type Candidate = { index: number; value: string }
  const candidates: Candidate[] = []

  function tryRe(re: RegExp, normalize: boolean): void {
    const m = re.exec(src)
    if (m) {
      const value = normalize ? m[1].replace(/\s+/g, ' ').trim() : m[1]
      candidates.push({ index: m.index, value })
    }
  }

  tryRe(/description:\s*'((?:[^'\\]|\\.)*)'/s, false)
  tryRe(/description:\s*"((?:[^"\\]|\\.)*)"/s, false)
  tryRe(/description:\s*\n\s*'((?:[^'\\]|\\.)*)'/s, true)
  tryRe(/description:\s*\n\s*"((?:[^"\\]|\\.)*)"/s, true)

  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.index - b.index)
  return candidates[0].value
}

/** Parse surfaces array from meta block, e.g. surfaces: ['internal', 'mcp', 'client'] */
function extractSurfaces(src: string): string[] {
  const re = /surfaces:\s*\[([^\]]*)\]/
  const m = re.exec(src)
  if (!m) return ['internal']
  return [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1])
}

// Parses meta.plan, e.g. plan: 'plus'. `\b` avoids matching `membership_plan: '...'`.
function extractPlan(src: string): ToolPlan | null {
  const m = /\bplan:\s*'(free|plus|pro)'/.exec(src)
  return (m?.[1] as ToolPlan | undefined) ?? null
}

function extractRequiredScopes(src: string): string[] {
  const block = /requiredScopes:\s*\{([\s\S]*?)\}/.exec(src)?.[1]
  return block == null ? [] : [...block.matchAll(/'([^']+:[^']+)'/g)].map(match => match[1])
}

/** Parse api field: either null or an array of {method, path} objects. */
function extractApi(src: string): ApiEndpoint[] | null {
  // api: null
  if (/api:\s*null/.test(src)) return null

  // api: [{ method: 'GET', path: '/api/v1/...' }, ...]
  const apiBlockRe = /api:\s*\[([^\]]*)\]/s
  const blockMatch = apiBlockRe.exec(src)
  if (!blockMatch) return null

  const block = blockMatch[1]
  const entryRe = /method:\s*'([A-Z]+)'[^}]*path:\s*'([^']+)'/g
  const entries: ApiEndpoint[] = []
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(block)) !== null) {
    entries.push({ method: m[1], path: m[2] })
  }
  return entries.length > 0 ? entries : null
}

function parseToolFile(filePath: string): ToolEntry | null {
  const src = readFileSync(filePath, 'utf8')
  const name = extractNameField(src, 'name') ?? extractNameField(src, 'toolName')
  if (!name) return null
  return {
    name,
    description: extractDescription(src),
    surfaces: extractSurfaces(src),
    requiredScopes: extractRequiredScopes(src),
    readOnlyHint: /readOnlyHint:\s*true/.test(src),
    destructiveHint: /destructiveHint:\s*true/.test(src),
    api: extractApi(src),
    parameters: null,
    plan: extractPlan(src),
  }
}

function generateToolTable(tools: ToolEntry[]): string {
  const rows = tools.map(tool => {
    const surfacesStr = tool.surfaces.join(', ')
    const hintStr = tool.readOnlyHint ? 'read-only' : tool.destructiveHint ? 'mutating' : '—'
    const apiStr =
      tool.api == null ? '—' : tool.api.map(e => `\`${e.method} ${e.path}\``).join(', ')
    // Plan gating only applies at the user `mcp` surface dispatch boundary (see
    // backend/tools/types.mts#ToolMeta.plan); a tool without that surface has no plan concept.
    const planStr = tool.surfaces.includes('mcp') ? (tool.plan ?? 'free') : '—'
    return `| \`${tool.name}\` | ${tool.description ?? '—'} | ${surfacesStr} | ${planStr} | ${tool.requiredScopes.join(', ') || '—'} | ${hintStr} | ${apiStr} |`
  })

  return [
    '| Tool | Description | Surfaces | Plan | Required scopes | Hint | REST Equivalent |',
    '| ---- | ----------- | -------- | ---- | --------------- | ---- | --------------- |',
    ...rows,
  ].join('\n')
}

function main() {
  const filePaths = getToolFilePaths()
  const tools = filePaths.reduce<ToolEntry[]>((acc, fp) => {
    const t = parseToolFile(fp)
    if (t !== null) acc.push(t)
    return acc
  }, [])

  // Update the generated tool catalog.
  const docPath = path.join(ROOT, 'docs/overview/architecture/agent-tools/catalog.md')
  const existing = readFileSync(docPath, 'utf8')
  const beginIdx = existing.indexOf(BEGIN)
  const endIdx = existing.indexOf(END)
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error('agent-tools/catalog.md is missing BEGIN/END GENERATED markers')
  }
  const before = existing.slice(0, beginIdx + BEGIN.length)
  const after = existing.slice(endIdx)
  writeFileSync(docPath, `${before}\n\n${generateToolTable(tools)}\n\n${after}`)

  // Generate manifest.json for client-surface tools
  const clientTools = tools.filter(t => t.surfaces.includes('client'))
  const manifest = {
    tools: clientTools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      api: t.api,
      requiredScopes: t.requiredScopes,
    })),
  }
  writeFileSync(
    path.join(ROOT, 'backend/tools/manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )

  console.log(`Generated agent-tools/catalog.md with ${tools.length} tools`)
  console.log(`Generated manifest.json with ${clientTools.length} client tools`)
}

main()
