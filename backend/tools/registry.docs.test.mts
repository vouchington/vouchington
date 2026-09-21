/**
 * Freshness tests: fail CI when the agent-tool catalog or manifest.json drift
 * from the registry. Run `pnpm docs:agent-tools` from the repo root to fix.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.join(import.meta.dirname, '../..')
const TOOLS_DIR = path.join(ROOT, 'backend/tools')
const REGISTRY_FILE = path.join(TOOLS_DIR, 'registry/index.mts')

const BEGIN = '<!-- BEGIN GENERATED -->'
const END = '<!-- END GENERATED -->'

// ---------------------------------------------------------------------------
// Static parser — mirrors generate-agent-tools-doc.mts but does not import
// tool implementations (which transitively pull in data-store connections).
// ---------------------------------------------------------------------------

type ApiEndpoint = { method: string; path: string }

type ToolEntry = {
  name: string
  description: string | null
  surfaces: string[]
  plan: string | null
  requiredScopes: string[]
  readOnlyHint: boolean
  destructiveHint: boolean
  api: ApiEndpoint[] | null
}

function getToolFilePaths(): string[] {
  const src = readFileSync(REGISTRY_FILE, 'utf-8')
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

function extractSurfaces(src: string): string[] {
  const re = /surfaces:\s*\[([^\]]*)\]/
  const m = re.exec(src)
  if (!m) return ['internal']
  return [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1])
}

function extractRequiredScopes(src: string): string[] {
  const block = /requiredScopes:\s*\{([\s\S]*?)\}/.exec(src)?.[1]
  return block == null ? [] : [...block.matchAll(/'([^']+:[^']+)'/g)].map(match => match[1])
}

function extractPlan(src: string): string | null {
  return extractNameField(src, 'plan')
}

function extractApi(src: string): ApiEndpoint[] | null {
  if (/api:\s*null/.test(src)) return null
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
  const src = readFileSync(filePath, 'utf-8')
  const name = extractNameField(src, 'name') ?? extractNameField(src, 'toolName')
  if (!name) return null
  return {
    name,
    description: extractDescription(src),
    surfaces: extractSurfaces(src),
    plan: extractPlan(src),
    requiredScopes: extractRequiredScopes(src),
    readOnlyHint: /readOnlyHint:\s*true/.test(src),
    destructiveHint: /destructiveHint:\s*true/.test(src),
    api: extractApi(src),
  }
}

function generateToolTable(tools: ToolEntry[]): string {
  const rows = tools.map(tool => {
    const surfacesStr = tool.surfaces.join(', ')
    const hintStr = tool.readOnlyHint ? 'read-only' : tool.destructiveHint ? 'mutating' : '—'
    const planStr = tool.surfaces.includes('mcp') ? (tool.plan ?? 'free') : '—'
    const apiStr =
      tool.api == null ? '—' : tool.api.map(e => `\`${e.method} ${e.path}\``).join(', ')
    return `| \`${tool.name}\` | ${tool.description ?? '—'} | ${surfacesStr} | ${planStr} | ${tool.requiredScopes.join(', ') || '—'} | ${hintStr} | ${apiStr} |`
  })
  return [
    '| Tool | Description | Surfaces | User MCP automation plan | Required scopes | Hint | REST Equivalent |',
    '| ---- | ----------- | -------- | ------------------------ | --------------- | ---- | --------------- |',
    ...rows,
  ].join('\n')
}

function loadTools(): ToolEntry[] {
  const filePaths = getToolFilePaths()
  return filePaths.reduce<ToolEntry[]>((acc, fp) => {
    const t = parseToolFile(fp)
    if (t !== null) acc.push(t)
    return acc
  }, [])
}

/**
 * Normalize a markdown table so that cell padding differences (added by oxfmt)
 * do not cause false failures. Trims whitespace from each cell, and collapses
 * separator rows (containing only dashes, pipes, and spaces) to a single dash
 * per cell so padding width doesn't matter.
 */
function normalizeTable(table: string): string {
  return table
    .split('\n')
    .map(line => {
      if (!line.startsWith('|')) return line
      const cells = line.split('|').map(c => c.trim())
      // Separator row: every non-empty cell contains only dashes (and colons for alignment)
      const isSeparator = cells.every(c => c === '' || /^:?-+:?$/.test(c))
      if (isSeparator) {
        return cells
          .map(c => (c === '' ? '' : '-'))
          .join(' | ')
          .replace(/^ \| /, '| ')
          .replace(/ \| $/, ' |')
      }
      return cells.join(' | ').replace(/^ \| /, '| ').replace(/ \| $/, ' |')
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('docs freshness', () => {
  it('agent-tool catalog generated section matches registry', () => {
    const docPath = path.join(ROOT, 'docs/overview/architecture/agent-tools/catalog.md')
    const existing = readFileSync(docPath, 'utf-8')

    const startIdx = existing.indexOf(BEGIN)
    const endIdx = existing.indexOf(END)
    if (startIdx === -1) {
      throw new Error('agent-tools/catalog.md must have <!-- BEGIN GENERATED --> marker')
    }
    if (endIdx === -1) {
      throw new Error('agent-tools/catalog.md must have <!-- END GENERATED --> marker')
    }

    const currentSection = normalizeTable(existing.slice(startIdx + BEGIN.length, endIdx).trim())
    const tools = loadTools()
    const expectedSection = normalizeTable(generateToolTable(tools))

    expect(currentSection).toBe(expectedSection)
  })

  it('manifest.json matches client-surface tools in registry', () => {
    const manifestPath = path.join(ROOT, 'backend/tools/manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

    const tools = loadTools()
    const clientTools = tools.filter(t => t.surfaces.includes('client'))
    expect(manifest).toEqual({
      tools: clientTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: null,
        api: tool.api,
        requiredScopes: tool.requiredScopes,
      })),
    })
  })

  it('publishes paid plans only in the user MCP catalog', () => {
    const doc = readFileSync(
      path.join(ROOT, 'docs/overview/architecture/agent-tools/catalog.md'),
      'utf-8',
    )
    const manifest = readFileSync(path.join(ROOT, 'backend/tools/manifest.json'), 'utf-8')

    expect(doc).toContain('User MCP automation plan')
    expect(doc).toContain('`manage_my_cards`')
    expect(doc).toContain('plus')
    expect(manifest).not.toContain('"plan"')
  })

  it('every client/mcp/admin_mcp tool api path corresponds to a real route', async () => {
    const { readdir, readFile } = await import('node:fs/promises')
    const apiV1Dir = path.join(ROOT, 'backend/api/v1')

    async function collectFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true })
      const files: string[] = []
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          files.push(...(await collectFiles(full)))
        } else if (entry.name.endsWith('.mts') && !/\.test\./.test(entry.name)) {
          files.push(full)
        }
      }
      return files
    }

    const routeFiles = await collectFiles(apiV1Dir)
    const routeContents = await Promise.all(routeFiles.map(f => readFile(f, 'utf-8')))
    const allRouteText = routeContents.join('\n')

    const tools = loadTools()

    type RouteEndpoint = { toolName: string; path: string }
    type RouteCheck = RouteEndpoint & { regex: RegExp }
    const endpoints = tools.reduce<RouteEndpoint[]>((acc, tool) => {
      const surfaces = new Set(tool.surfaces)
      if (
        (!surfaces.has('client') && !surfaces.has('mcp') && !surfaces.has('admin_mcp')) ||
        tool.api == null
      ) {
        return acc
      }
      for (const endpoint of tool.api) {
        acc.push({ toolName: tool.name, path: endpoint.path })
      }
      return acc
    }, [])
    const routeChecks = endpoints.map(({ toolName, path: endpointPath }) => {
      const pathPattern = endpointPath.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/')
      return {
        toolName,
        path: endpointPath,
        regex: new RegExp(`\\.route\\('${pathPattern}'`),
      } satisfies RouteCheck
    })

    expect(routeChecks.length).toBeGreaterThan(0)
    for (const { toolName, path: endpointPath, regex } of routeChecks) {
      if (!regex.test(allRouteText)) {
        throw new Error(
          `Tool ${toolName}: API path ${endpointPath} has no matching .route() in backend/api/v1/`,
        )
      }
    }
  })
})
