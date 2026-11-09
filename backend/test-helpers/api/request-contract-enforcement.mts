import { Application, type Handler, type RouteBuilder } from '@jongleberry/api-server'
import { RuntimeRequestValidatorRegistry } from '../../services/runtime-request-validation/index.mts'
import { REQUEST_CONTRACT_EXEMPTIONS } from './request-contract-exemptions.mts'

// Production validates every contracted request but cannot verify that a route did so: by the time
// a check could run the handler's side effects are done. Tests wrap every route instead and fail
// the owning test when validation was skipped or ran under another route's operation key.
// `vitest.setup.request-contract-enforcement.mts` installs this once for the whole project.

export const REQUEST_CONTRACT_VALIDATION_MISSING = 'REQUEST_CONTRACT_VALIDATION_MISSING'
export const REQUEST_CONTRACT_OPERATION_MISMATCH = 'REQUEST_CONTRACT_OPERATION_MISMATCH'

type RouteMethod = 'delete' | 'get' | 'patch' | 'post' | 'put'
class ContractViolation extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}
type RoutePatch = Application['route'] & { requestContractEnforced?: true }

const VIOLATIONS_KEY = '__vouchaRequestContractViolations'
const REGISTRIES = new WeakMap<Application, RuntimeRequestValidatorRegistry>()
const globals = globalThis as typeof globalThis & { [VIOLATIONS_KEY]?: ContractViolation[] }

/** Drains violations recorded since the last call, so a test that provokes one can own it. */
export function takeRequestContractViolations(): ContractViolation[] {
  const violations = globals[VIOLATIONS_KEY] ?? []
  globals[VIOLATIONS_KEY] = []
  return violations
}

/** Points one app at a registry other than the shared checked-in one. */
export function useRequestContractRegistry(
  app: Application,
  registry: RuntimeRequestValidatorRegistry,
): void {
  REGISTRIES.set(app, registry)
}

/** Wraps `Application.prototype.route` once so every test-built app checks its handlers. */
export function installRequestContractEnforcement(): void {
  const original = Application.prototype.route as RoutePatch
  if (original.requestContractEnforced) return

  const patched: RoutePatch = function (this: Application, path) {
    const builder = original.call(this, path)
    const methods = builder as unknown as Record<
      RouteMethod,
      (handler: Handler, ...options: unknown[]) => RouteBuilder
    >
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const originalMethod = methods[method]
      methods[method] = (handler, ...options) =>
        Reflect.apply(originalMethod, builder, [
          withContractCheck(handler, `${method.toUpperCase()}:${path}`, this),
          ...options,
        ])
    }
    return builder
  }
  patched.requestContractEnforced = true
  Application.prototype.route = patched
}

function withContractCheck(handler: Handler, operation: string, app: Application): Handler {
  return async ctx => {
    try {
      await handler(ctx)
    } catch (err) {
      // An early auth or validation rejection is fine, but a mis-keyed validator is not.
      const validated = ctx.requestContractValidatedOperation
      if (validated !== undefined && validated !== operation) record(mismatch(operation, validated))
      throw err
    }

    const validated = ctx.requestContractValidatedOperation
    if (validated !== undefined && validated !== operation) {
      record(mismatch(operation, validated))
    } else if (validated === undefined && needsValidation(operation, app)) {
      record(
        violation(
          REQUEST_CONTRACT_VALIDATION_MISSING,
          `Request contract validation did not run for ${operation}`,
        ),
      )
    }
  }
}

function needsValidation(operation: string, app: Application): boolean {
  const registry = REGISTRIES.get(app) ?? RuntimeRequestValidatorRegistry.shared
  return (
    !Object.hasOwn(REQUEST_CONTRACT_EXEMPTIONS, operation) && registry.hasInputCarriers(operation)
  )
}

function mismatch(operation: string, validated: string): ContractViolation {
  return violation(
    REQUEST_CONTRACT_OPERATION_MISMATCH,
    `Request contract operation mismatch: request is ${operation}, validation used ${validated}`,
  )
}

function violation(code: string, message: string): ContractViolation {
  return new ContractViolation(code, message)
}

function record(error: ContractViolation): void {
  const violations = globals[VIOLATIONS_KEY] ?? []
  violations.push(error)
  globals[VIOLATIONS_KEY] = violations
}
