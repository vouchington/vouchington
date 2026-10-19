import type { Tool, ToolAnnotations, ToolApiEndpoint } from '@services/openai-agents/tool-types'

export type ApiHintConflict = { tool: string; conflict: string }

const IDEMPOTENT_METHODS: ReadonlySet<ToolApiEndpoint['method']> = new Set(['PUT', 'DELETE'])

// A tool's MCP hints must agree with the REST operations it names: a read maps only to GETs, and a
// user write may claim idempotency with a required UUID admission key, or when every operation is
// PUT or DELETE. A conservative false hint is always valid. Staff actions on admin and legal
// audiences declare service semantics explicitly: history and guarded no-ops do not follow HTTP methods.
export function findApiHintConflicts(tools: readonly Tool[]): ApiHintConflict[] {
  return tools.flatMap(tool => {
    const meta = tool.meta
    const conflict = meta?.api?.length
      ? hintConflict(
          meta.annotations,
          meta.api,
          meta.audience === 'admin' || meta.audience === 'legal',
          hasRequiredIdempotencyKey(tool) ||
            meta.api.every(route => route.method === 'POST' && route.path === '/api/v1/rss-feeds'),
        )
      : null
    return conflict === null ? [] : [{ tool: tool.schema.name, conflict }]
  })
}

function hintConflict(
  annotations: ToolAnnotations,
  api: readonly ToolApiEndpoint[],
  staffAction: boolean,
  requiredIdempotencyKey: boolean,
): string | null {
  const methods = api.map(({ method }) => method)
  if (annotations.readOnlyHint)
    return methods.every(method => method === 'GET')
      ? null
      : 'a read-only tool names a non-GET operation'
  if (methods.includes('GET') && !rssImportStatusRead(api))
    return 'a write tool names a GET operation'
  if (staffAction)
    return typeof annotations.idempotentHint === 'boolean'
      ? null
      : 'staff write must declare idempotentHint'
  const idempotent =
    requiredIdempotencyKey || methods.every(method => IDEMPOTENT_METHODS.has(method))
  return typeof annotations.idempotentHint === 'boolean' &&
    (!annotations.idempotentHint || idempotent)
    ? null
    : `idempotentHint should be ${idempotent}`
}

// submit_rss_feed stays one write tool. Its import_status option reads the import it just created.
function rssImportStatusRead(api: readonly ToolApiEndpoint[]): boolean {
  const reads = api.filter(route => route.method === 'GET')
  return (
    reads.length > 0 &&
    api.some(route => route.method !== 'GET') &&
    reads.every(route => route.path === '/api/v1/my/import/rss-feeds/:importId')
  )
}

function hasRequiredIdempotencyKey(tool: Tool): boolean {
  const root = tool.schema.parameters
  if (!root) return false
  function check(schema: Record<string, unknown>): boolean {
    const ref = schema['$ref']
    if (typeof ref === 'string' && ref.startsWith('#/$defs/')) {
      const definitions = root!['$defs'] as Record<string, Record<string, unknown>> | undefined
      const target = definitions?.[ref.slice('#/$defs/'.length)]
      return target ? check(target) : false
    }
    const branches = schema['oneOf'] as Record<string, unknown>[] | undefined
    if (branches) return branches.length > 0 && branches.every(check)
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined
    if (properties?.['arguments']) return check(properties['arguments'])
    const required = schema['required']
    const key = properties?.['idempotency_key']
    return (
      Array.isArray(required) &&
      required.includes('idempotency_key') &&
      key?.['type'] === 'string' &&
      key['format'] === 'uuid'
    )
  }
  return check(root)
}
