import runtimeContracts from '@voucha/api-fixtures/v1/request-contracts.json' with { type: 'json' }
import {
  RequestContractValidatorRegistry,
  type RequestCarrier,
  type RequestValidationError,
} from '@vouchington/request-contract-validation'

export type RuntimeRequestContractsBundle = {
  version: 1
  source: 'checked-in-request-contracts'
  components: Record<string, unknown>
  operations: Record<string, { body?: unknown; header?: unknown; path?: unknown; query?: unknown }>
}

export type RuntimeRequestValidationError = RequestValidationError

/**
 * Compiles the generated contract bundle once. Route families opt in after their standard
 * preamble — authentication/authorization for authenticated routes, or rate-limiting and any
 * honeypot/attempt-counter checks for public routes — so this boundary cannot disclose schemas,
 * or let a shape probe skip a counter, ahead of that existing gate.
 */
export class RuntimeRequestValidatorRegistry {
  /** Shared generated registry for route-family adoption after that existing preamble. */
  static readonly shared = new RuntimeRequestValidatorRegistry(
    runtimeContracts as RuntimeRequestContractsBundle,
  )

  private readonly registry: RequestContractValidatorRegistry

  constructor(bundle: RuntimeRequestContractsBundle) {
    this.registry = new RequestContractValidatorRegistry(bundle)
  }

  validateBody(operation: string, value: unknown): RuntimeRequestValidationError | null {
    return this.validate(operation, 'body', value)
  }

  validate(
    operation: string,
    carrier: RequestCarrier,
    value: unknown,
  ): RuntimeRequestValidationError | null {
    if (!this.registry.hasOperation(operation)) return null
    return this.registry.validate(operation, carrier, value)
  }

  hasOperation(operation: string): boolean {
    return this.registry.hasOperation(operation)
  }

  /**
   * Route families call this after their existing auth/ownership guard and before handing
   * untrusted values to a service. Unknown generated operations fail closed.
   */
  validateAuthenticated(
    operation: string,
    input: Partial<Record<RequestCarrier, unknown>>,
  ): RuntimeRequestValidationError | null {
    if (!this.hasOperation(operation)) {
      throw new Error(`No generated runtime request contract for ${operation}`)
    }
    return this.registry.validateOperation(operation, input)
  }
}
