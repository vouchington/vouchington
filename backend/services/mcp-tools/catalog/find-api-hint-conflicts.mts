import type { Tool, ToolAnnotations, ToolApiEndpoint } from '@voucha/tools/types'

export type ApiHintConflict = { tool: string; conflict: string }

const IDEMPOTENT_METHODS: ReadonlySet<ToolApiEndpoint['method']> = new Set(['PUT', 'DELETE'])

// A tool's MCP hints must agree with the REST operations it names: a read maps only to GETs, and a
// write is idempotent exactly when every operation it maps to is a PUT or DELETE.
export function findApiHintConflicts(tools: readonly Tool[]): ApiHintConflict[] {
  return tools.flatMap(tool => {
    const meta = tool.meta
    const conflict = meta?.api?.length ? hintConflict(meta.annotations, meta.api) : null
    return conflict === null ? [] : [{ tool: tool.schema.name, conflict }]
  })
}

function hintConflict(
  annotations: ToolAnnotations,
  api: readonly ToolApiEndpoint[],
): string | null {
  const methods = api.map(({ method }) => method)
  if (annotations.readOnlyHint)
    return methods.every(method => method === 'GET')
      ? null
      : 'a read-only tool names a non-GET operation'
  if (methods.includes('GET')) return 'a write tool names a GET operation'
  const idempotent = methods.every(method => IDEMPOTENT_METHODS.has(method))
  return annotations.idempotentHint === idempotent ? null : `idempotentHint should be ${idempotent}`
}
