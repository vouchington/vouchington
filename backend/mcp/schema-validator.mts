import * as AjvModule from 'ajv'
import type { ValidateFunction } from 'ajv'
import * as AddFormatsModule from 'ajv-formats'

// One Ajv setup for everything the MCP surface validates: tool arguments on the way in and
// declared output schemas on the way out. Validators are cached per schema object identity.
const validators = new WeakMap<object, ValidateFunction>()
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
  const error = validate.errors?.[0]
  return `${error?.instancePath || '/'} ${error?.message ?? 'is invalid'}`
}

function compileValidator(schema: object): ValidateFunction {
  const ajv = new AjvCtor({ allErrors: false, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}
