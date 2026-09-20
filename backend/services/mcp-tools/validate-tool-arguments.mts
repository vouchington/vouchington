import * as AjvModule from 'ajv'
import type { ValidateFunction } from 'ajv'
import * as AddFormatsModule from 'ajv-formats'

const validators = new WeakMap<object, ValidateFunction>()
type AjvConstructor = typeof AjvModule.Ajv
const AjvCtor = (AjvModule.default ?? AjvModule) as unknown as AjvConstructor
type AddFormats = (ajv: InstanceType<AjvConstructor>) => InstanceType<AjvConstructor>
const addFormats = (AddFormatsModule.default ?? AddFormatsModule) as unknown as AddFormats

export function validateToolArguments(
  schema: Record<string, unknown> | null,
  args: unknown,
): string | null {
  const normalizedSchema = schema ?? { type: 'object', properties: {} }
  const validate = validators.get(normalizedSchema) ?? compileToolValidator(normalizedSchema)
  validators.set(normalizedSchema, validate)
  if (validate(args)) return null
  const error = validate.errors?.[0]
  return `${error?.instancePath || '/'} ${error?.message ?? 'is invalid'}`
}

function compileToolValidator(schema: Record<string, unknown>): ValidateFunction {
  const ajv = new AjvCtor({ allErrors: false, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}
