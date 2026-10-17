import type { McpResultFixtureCase } from '@voucha/test-helpers/native-mcp-result-cases'
import { findSchemaViolation } from '@voucha/mcp/schema-validator'
import { getOptionOutputSchema } from '@voucha/mcp/option-output-pointers'
import type { McpCatalog } from './build-mcp-catalog.mts'

/** Validate generated result cases against the same catalog exposed to clients. */
export function buildMcpResultFixtures(
  catalog: McpCatalog,
  cases: readonly McpResultFixtureCase[],
) {
  const tools = catalog.servers.find(server => server.surface === 'mcp')?.tools ?? []
  const toolsByName = new Map(tools.map(entry => [entry.tool.name, entry.tool]))
  const seen = new Set<string>()
  for (const fixture of cases) {
    if (seen.has(fixture.id)) throw new Error(`Duplicate MCP result fixture: ${fixture.id}`)
    seen.add(fixture.id)
    const tool = toolsByName.get(fixture.tool)
    if (!tool?.outputSchema)
      throw new Error(`MCP result fixture ${fixture.id} has no cataloged output schema`)
    const inputViolation = findSchemaViolation(tool.inputSchema, fixture.arguments)
    if (inputViolation)
      throw new Error(`MCP result fixture ${fixture.id} arguments: ${inputViolation}`)
    const pointer =
      tool['_meta']?.['voucha/optionOutputPointers']?.[fixture.arguments['option'] as string]
    const selected = pointer ? getOptionOutputSchema(tool.outputSchema, pointer) : tool.outputSchema
    const outputViolation =
      findSchemaViolation(selected, fixture.structuredContent) ??
      findSchemaViolation(tool.outputSchema, fixture.structuredContent)
    if (outputViolation)
      throw new Error(`MCP result fixture ${fixture.id} structuredContent: ${outputViolation}`)
  }
  return { version: 1, cases }
}
