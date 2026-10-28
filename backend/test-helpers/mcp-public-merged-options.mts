import type { Tool } from '../services/openai-agents/tool-types.mts'
import { sampleMcpToolArguments } from './mcp-operation-sample.mts'

/** Per-option contracts exposed by a registered merged tool's public schema and route selector. */
export function publicMergedOptionGroups(tools: readonly Tool[]) {
  return tools.map(tool => {
    const parameters = tool.schema.parameters as Record<string, unknown>
    const branches = parameters['oneOf'] as Record<string, unknown>[]
    const descriptions = tool.schema.description?.split('\n') ?? []
    if (!Array.isArray(branches) || !tool.meta?.selectApi)
      throw new Error(`${tool.schema.name} is not a merged tool`)
    return {
      name: tool.schema.name,
      options: branches.map(branch => {
        const properties = branch['properties'] as Record<string, Record<string, unknown>>
        const option = (properties['option']?.['enum'] as string[] | undefined)?.[0]
        const argumentSchema = properties['arguments']
        if (!option || !argumentSchema) throw new Error(`${tool.schema.name} lacks an option`)
        const description = descriptions.find(line => line.startsWith(`${option}: `))
        if (!description) throw new Error(`${tool.schema.name}.${option} lacks a description`)
        const reference = argumentSchema['$ref']
        const definitions = parameters['$defs'] as
          | Record<string, Record<string, unknown>>
          | undefined
        const resolvedArguments =
          typeof reference === 'string' && reference.startsWith('#/$defs/')
            ? definitions?.[reference.slice('#/$defs/'.length)]
            : argumentSchema
        if (!resolvedArguments)
          throw new Error(`${tool.schema.name}.${option} has an unresolved schema`)
        const sourceParameters = {
          ...resolvedArguments,
          ...(parameters['$defs'] ? { $defs: parameters['$defs'] } : {}),
        } as Tool['schema']['parameters']
        const args = sampleMcpToolArguments({
          schema: { name: tool.schema.name, parameters: sourceParameters },
        })
        const api = tool.meta!.selectApi!({ option, arguments: args })
        return {
          option,
          source: {
            schema: {
              name: tool.schema.name,
              parameters: sourceParameters,
              description: description.slice(option.length + 2),
            },
            meta: { ...tool.meta!, api, selectApi: undefined },
          },
        }
      }),
    }
  })
}
