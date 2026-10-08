import { Ajv, type ValidateFunction } from 'ajv'
import type { GenerateJsonRequest, JsonSchema } from './types.mts'

const ajv = new Ajv({ strict: false, allErrors: false })
const compiled = new WeakMap<JsonSchema, ValidateFunction>()

function compile(schema: JsonSchema): ValidateFunction {
  const existing = compiled.get(schema)
  if (existing) return existing
  const validate = ajv.compile(schema)
  compiled.set(schema, validate)
  return validate
}

/**
 * Parses a provider's text answer, validates it against the request's own JSON schema (the same
 * schema sent to the provider, so a provider that ignores or loosens it cannot widen the contract)
 * and narrows it with the caller's `parse`. Throws a plain `Error` describing the first problem;
 * the caller wraps it with the billed response so the usage is still recorded.
 */
export function parseSchemaValidJson<T>(text: string, request: GenerateJsonRequest<T>): T {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (err) {
    throw new Error('Model output is not valid JSON.', { cause: err })
  }
  const validate = compile(request.schema)
  if (!validate(value)) {
    throw new Error(`Model output does not match the schema: ${ajv.errorsText(validate.errors)}`)
  }
  return request.parse(value)
}
