import type { Tool, ToolMeta, ToolOutputSchema } from '@services/openai-agents/tool-types'
import { closeDeclaredInputObjects, factorToolSchema } from './tool-schema-contract.mts'
import { findSchemaViolation } from './schema-validator.mts'

export type MergedToolSource<TArgs = never, TResult = unknown> = Pick<
  Tool<TArgs, TResult>,
  'function' | 'roles'
> & {
  schema: Pick<Tool<TArgs, TResult>['schema'], 'parameters' | 'description'>
  meta: ToolMeta
}
export type MergedToolOption<TArgs = never, TResult = unknown> = {
  option: string
  source: MergedToolSource<TArgs, TResult>
}

function scopedSchema(schema: Record<string, unknown>, index: number) {
  const prefix = `Option${index}_`
  const definitions = schema['$defs'] as Record<string, unknown> | undefined
  function rewrite(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rewrite)
    if (value === null || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === '$ref' && typeof item === 'string' && item.startsWith('#/$defs/')
          ? `#/$defs/${prefix}${item.slice('#/$defs/'.length)}`
          : rewrite(item),
      ]),
    )
  }
  const { $defs: _definitions, ...body } = schema
  return {
    body: rewrite(body) as Record<string, unknown>,
    definitions: Object.fromEntries(
      Object.entries(definitions ?? {}).map(([key, value]) => [`${prefix}${key}`, rewrite(value)]),
    ),
  }
}

/** One MCP name, with each source tool's validator, handler and REST route selection retained. */
export function createMergedTool(
  name: string,
  title: string,
  options: readonly MergedToolOption[],
): Tool {
  if (options.length < 2) throw new Error(`${name} must merge at least two tools`)
  const first = options[0]!.source
  if (!first.meta?.outputSchema) throw new Error(`${name} needs source output schemas`)
  const byOption = new Map(options.map(entry => [entry.option, entry.source]))
  if (byOption.size !== options.length) throw new Error(`${name} has duplicate options`)
  const commonMeta = first.meta
  const identity = (tool: MergedToolSource) =>
    JSON.stringify({
      scopes: tool.meta?.requiredScopes?.mcp,
      plan: tool.meta?.plan ?? 'free',
      // ast-grep-ignore: no-roles-outside-services -- Declared tool gates, not user roles; authorization stays in mcp-tools services.
      roles: tool.roles ?? null,
      annotations: tool.meta?.annotations,
    })
  for (const { source: tool } of options) {
    if (!tool.meta?.outputSchema || identity(tool) !== identity(first)) {
      throw new Error(`${name} source tools have incompatible declared metadata`)
    }
  }

  const inputBranches = options.map(({ option, source: tool }, index) => {
    const scoped = scopedSchema(
      closeDeclaredInputObjects(tool.schema.parameters ?? { type: 'object', properties: {} }),
      index,
    )
    return {
      body: {
        type: 'object',
        properties: { option: { enum: [option] }, arguments: scoped.body },
        required: ['option', 'arguments'],
        additionalProperties: false,
      },
      definitions: scoped.definitions,
    }
  })
  const outputBranches: Record<string, unknown>[] = []
  const outputDefinitions: Record<string, unknown> = {}
  const definitionByBody = new Map<string, string>()
  const seenOutputSchemas = new Set<string>()
  for (const [index, { source }] of options.entries()) {
    const outputSchema = source.meta.outputSchema!
    const schemaKey = JSON.stringify(outputSchema)
    if (seenOutputSchemas.has(schemaKey)) continue
    seenOutputSchemas.add(schemaKey)
    const scoped = scopedSchema(outputSchema, index)
    const replacements = new Map<string, string>()
    for (const [name, definition] of Object.entries(scoped.definitions)) {
      const body = JSON.stringify(definition)
      const existing = definitionByBody.get(body)
      if (existing) replacements.set(name, existing)
      else {
        definitionByBody.set(body, name)
        outputDefinitions[name] = definition
      }
    }
    const dedupeRefs = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(dedupeRefs)
      if (value === null || typeof value !== 'object') return value
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          key === '$ref' && typeof item === 'string' && item.startsWith('#/$defs/')
            ? `#/$defs/${replacements.get(item.slice('#/$defs/'.length)) ?? item.slice('#/$defs/'.length)}`
            : dedupeRefs(item),
        ]),
      )
    }
    for (const name of Object.keys(scoped.definitions)) {
      if (Object.hasOwn(outputDefinitions, name)) {
        outputDefinitions[name] = dedupeRefs(outputDefinitions[name])
      }
    }
    outputBranches.push(dedupeRefs(scoped.body) as Record<string, unknown>)
  }
  const allRoutes = options.flatMap(({ source: tool }) => tool.meta?.api ?? [])
  const api = [
    ...new Map(allRoutes.map(route => [`${route.method}:${route.path}`, route])).values(),
  ]
  const selected = (args: Record<string, unknown>) => byOption.get(args['option'] as string)
  const parameters = factorToolSchema({
    type: 'object',
    oneOf: inputBranches.map(entry => entry.body),
    $defs: Object.assign({}, ...inputBranches.map(entry => entry.definitions)),
  })
  return {
    // ast-grep-ignore: no-roles-outside-services -- Copies declared tool gates; no caller roles or authorization decisions are read here.
    ...(first.roles ? { roles: first.roles } : {}),
    schema: {
      name,
      type: 'function',
      description: options
        .map(({ option, source: tool }) => `${option}: ${tool.schema.description ?? ''}`)
        .join('\n'),
      parameters,
      strict: null,
    },
    meta: {
      ...commonMeta,
      title,
      surfaces: [...new Set(options.flatMap(({ source }) => source.meta.surfaces))],
      api: api.length ? api : null,
      outputSchema: factorToolSchema({
        ...(outputBranches.length === 1
          ? outputBranches[0]
          : { type: 'object', anyOf: outputBranches }),
        ...(Object.keys(outputDefinitions).length ? { $defs: outputDefinitions } : {}),
      }) as ToolOutputSchema,
      selectApi: args => {
        const source = selected(args)
        if (!source) return []
        const optionArguments = args['arguments'] as Record<string, unknown>
        return source.meta?.selectApi?.(optionArguments) ?? source.meta?.api ?? []
      },
      selectOutputSchema: args => selected(args)?.meta?.outputSchema,
      auditOption: args => (selected(args) ? (args['option'] as string) : null),
    },
    function: currentUser => (args, invocationContext) => {
      const violation = findSchemaViolation(parameters, args)
      if (violation) throw new Error(`Invalid merged tool arguments: ${violation}`)
      const input = args as { option: string; arguments: unknown }
      const source = byOption.get(input.option)
      if (!source) throw new Error(`${name} received an unknown option`)
      return source.function(currentUser)(input.arguments as never, invocationContext)
    },
  }
}
