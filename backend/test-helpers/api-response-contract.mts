import { readFileSync } from 'node:fs'
import { findSchemaViolation, inlineSchemaReferences } from '@vouchington/mcp-server/schema'

const contracts = JSON.parse(
  readFileSync(new URL('../../api-contracts/v1/request-contracts.json', import.meta.url), 'utf8'),
) as {
  responses: Record<string, Record<string, unknown>>
  components: Record<string, Record<string, unknown>>
}

/** Validate an actual handler response against the published executable response contract. */
export function validateApiResponseContract(operation: string, response: unknown): string | null {
  const schema = contracts.responses[operation]
  if (!schema) throw new Error(`Missing response contract: ${operation}`)
  return findSchemaViolation(inlineSchemaReferences(schema, contracts.components), response)
}
