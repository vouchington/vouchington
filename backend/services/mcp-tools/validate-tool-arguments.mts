import { findSchemaViolation, closeDeclaredInputObjects } from '@vouchington/mcp-server/schema'

const NO_PARAMETERS = {
  type: 'object',
  properties: {},
  additionalProperties: false,
}

export function validateToolArguments(
  schema: Record<string, unknown> | null,
  args: unknown,
): string | null {
  return findSchemaViolation(closeDeclaredInputObjects(schema ?? NO_PARAMETERS), args)
}
