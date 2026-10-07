import { findSchemaViolation } from '@voucha/mcp/schema-validator'

const NO_PARAMETERS = { type: 'object', properties: {} }

export function validateToolArguments(
  schema: Record<string, unknown> | null,
  args: unknown,
): string | null {
  return findSchemaViolation(schema ?? NO_PARAMETERS, args)
}
