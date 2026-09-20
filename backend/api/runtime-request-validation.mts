import * as AjvModule from 'ajv'
import type { AnySchema, ErrorObject, ValidateFunction } from 'ajv'
import * as AddFormatsModule from 'ajv-formats'
import runtimeContracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }

type AjvConstructor = typeof AjvModule.Ajv
const AjvCtor = (AjvModule.default ?? AjvModule) as unknown as AjvConstructor
type AddFormats = (ajv: InstanceType<AjvConstructor>) => InstanceType<AjvConstructor>
const addFormats = (AddFormatsModule.default ?? AddFormatsModule) as unknown as AddFormats

export type RuntimeRequestContractsBundle = {
  version: 1
  source: 'compiler-extracted-request-contracts'
  components: Record<string, unknown>
  operations: Record<string, { body?: unknown; header?: unknown; path?: unknown; query?: unknown }>
}

export type RuntimeRequestValidationError = {
  message: string
}

/**
 * Compiles the generated contract bundle once. Route families opt in after their standard
 * authentication/authorization preamble, so this boundary cannot disclose schemas to an
 * anonymous caller.
 */
export class RuntimeRequestValidatorRegistry {
  private readonly validators = new Map<string, Partial<Record<RequestCarrier, ValidateFunction>>>()

  constructor(bundle: RuntimeRequestContractsBundle) {
    const ajv = new AjvCtor({ allErrors: false, strict: false })
    addFormats(ajv)
    for (const [name, schema] of Object.entries(bundle.components)) {
      ajv.addSchema(schema as AnySchema, `#/components/schemas/${name}`)
    }
    for (const [operation, contract] of Object.entries(bundle.operations)) {
      const carriers: Partial<Record<RequestCarrier, ValidateFunction>> = {}
      for (const carrier of requestCarriers) {
        const schema = contract[carrier]
        if (schema) carriers[carrier] = ajv.compile(schema as AnySchema)
      }
      this.validators.set(operation, carriers)
    }
  }

  validateBody(operation: string, value: unknown): RuntimeRequestValidationError | null {
    return this.validate(operation, 'body', value)
  }

  validate(
    operation: string,
    carrier: RequestCarrier,
    value: unknown,
  ): RuntimeRequestValidationError | null {
    const validator = this.validators.get(operation)?.[carrier]
    if (!validator) return null
    if (validator(normalizeCarrierValue(carrier, value))) return null
    return { message: formatValidationError(carrier, validator.errors) }
  }

  hasOperation(operation: string): boolean {
    return this.validators.has(operation)
  }
}

type RequestCarrier = 'body' | 'header' | 'path' | 'query'
const requestCarriers: readonly RequestCarrier[] = ['body', 'header', 'path', 'query']

/** Shared generated registry for B7b–e route-family adoption after auth and authorization. */
export const runtimeRequestValidatorRegistry = new RuntimeRequestValidatorRegistry(
  runtimeContracts as RuntimeRequestContractsBundle,
)

/**
 * Deferred route hook: route families call it after their existing auth/ownership guard and before
 * handing untrusted values to a service. The foundation intentionally does no pre-auth validation.
 */
export function validateAuthenticatedRequest(
  operation: string,
  input: Partial<Record<RequestCarrier, unknown>>,
): RuntimeRequestValidationError | null {
  if (!runtimeRequestValidatorRegistry.hasOperation(operation)) {
    throw new Error(`No generated runtime request contract for ${operation}`)
  }
  for (const carrier of requestCarriers) {
    if (!(carrier in input)) continue
    const error = runtimeRequestValidatorRegistry.validate(operation, carrier, input[carrier])
    if (error) return error
  }
  return null
}

function normalizeCarrierValue(carrier: RequestCarrier, value: unknown): unknown {
  if (carrier !== 'header' || !value || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([name, headerValue]) => [
      name.toLowerCase(),
      headerValue,
    ]),
  )
}

function formatValidationError(
  carrier: RequestCarrier,
  errors: ErrorObject[] | null | undefined,
): string {
  const first = errors?.[0]
  if (!first) return `Invalid request ${carrier}`
  return `Invalid request ${carrier}: ${first.instancePath || '/'} ${first.message ?? 'is invalid'}`
}
