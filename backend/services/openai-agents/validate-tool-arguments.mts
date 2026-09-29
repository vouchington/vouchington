import * as AjvModule from 'ajv'
import type { ValidateFunction } from 'ajv'
import * as AddFormatsModule from 'ajv-formats'

const validators = new WeakMap<object, ValidateFunction>()
type AjvConstructor = typeof AjvModule.Ajv
const AjvCtor = (AjvModule.default ?? AjvModule) as unknown as AjvConstructor
type AddFormats = (ajv: InstanceType<AjvConstructor>) => InstanceType<AjvConstructor>
const addFormats = (AddFormatsModule.default ?? AddFormatsModule) as unknown as AddFormats

/** Validates arguments against the selected tool's existing JSON schema parameters. */
export function validateAgentToolArguments(parameters: unknown, args: unknown): string | null {
  if (parameters == null) return isPlainObject(args) ? null : '/ must be an object'
  if (!isPlainObject(parameters)) return '/ tool parameters schema must be an object'
  const validate = validators.get(parameters) ?? compileToolValidator(parameters)
  validators.set(parameters, validate)
  if (validate(args)) return null
  const error = validate.errors?.[0]
  return `${error?.instancePath || '/'} ${error?.message ?? 'is invalid'}`
}

function compileToolValidator(schema: Record<string, unknown>): ValidateFunction {
  const ajv = new AjvCtor({ allErrors: false, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
