import * as AjvModule from 'ajv'
import type { ValidateFunction } from 'ajv'
import * as AddFormatsModule from 'ajv-formats'

// One Ajv setup for everything the MCP surface validates: tool arguments on the way in and
// declared output schemas on the way out. Validators are cached per schema object identity.
const validators = new WeakMap<object, ValidateFunction>()
const selectedSchemas = new WeakMap<object, Map<object, object>>()
type AjvConstructor = typeof AjvModule.Ajv
const AjvCtor = (AjvModule.default ?? AjvModule) as unknown as AjvConstructor
type AddFormats = (ajv: InstanceType<AjvConstructor>) => InstanceType<AjvConstructor>
const addFormats = (AddFormatsModule.default ?? AddFormatsModule) as unknown as AddFormats

/**
 * The first violation of `schema` by `value`, or null when it conforms. The text names where and
 * which rule failed, never the offending value, so it is safe to log or report.
 */
export function findSchemaViolation(schema: object, value: unknown): string | null {
  const validate = validators.get(schema) ?? compileValidator(schema)
  validators.set(schema, validate)
  if (validate(value)) return null
  const selectedViolation = findSelectedArgumentViolation(schema, value)
  if (selectedViolation) return selectedViolation
  const error = validate.errors?.[0]
  return `${error?.instancePath || '/'} ${error?.message ?? 'is invalid'}`
}

// A failing oneOf can report another option's discriminator first. Preserve the selected source's
// argument diagnostic, after the complete envelope has already failed validation.
function findSelectedArgumentViolation(schema: object, value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('arguments' in value)) return null
  const input = value as Record<string, unknown>
  const root = schema as Record<string, unknown>
  const branches = root['oneOf']
  if (!Array.isArray(branches)) return null
  for (const branch of branches as Record<string, unknown>[]) {
    const properties = branch['properties'] as Record<string, Record<string, unknown>> | undefined
    const options = properties?.['option']?.['enum']
    const argumentsSchema = properties?.['arguments']
    if (!Array.isArray(options) || !options.includes(input['option']) || !argumentsSchema) continue
    const cached = selectedSchemas.get(schema) ?? new Map<object, object>()
    selectedSchemas.set(schema, cached)
    const selected = cached.get(branch) ?? { ...argumentsSchema, $defs: root['$defs'] ?? {} }
    cached.set(branch, selected)
    return findSchemaViolation(selected, input['arguments'])
  }
  return null
}

function compileValidator(schema: object): ValidateFunction {
  const ajv = new AjvCtor({ allErrors: false, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}
