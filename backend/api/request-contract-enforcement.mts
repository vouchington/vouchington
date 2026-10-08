import type { Application, Context, Handler, RouteBuilder } from '@jongleberry/api-server'
import { RuntimeRequestValidatorRegistry } from '@services/runtime-request-validation'
import { REQUEST_CONTRACT_EXEMPTIONS } from './request-contract-exemptions.mts'

export const REQUEST_CONTRACT_VALIDATION_MISSING = 'REQUEST_CONTRACT_VALIDATION_MISSING'

declare module '@jongleberry/api-server' {
  interface Context {
    requestContractOperation?: string
    requestContractValidated?: boolean
  }
}

type RouteMethod = 'delete' | 'get' | 'patch' | 'post' | 'put'
type RequestContractError = Error & {
  code: string
  status: number
  tags: Record<string, string>
}

/** Wraps route registration so every matched handler carries its checked-in operation key. */
export function installRequestContractEnforcement(
  app: Application,
  report: (error: Error) => void,
  registry = RuntimeRequestValidatorRegistry.shared,
): void {
  const originalRoute = app.route
  app.route = path => {
    const builder = originalRoute.call(app, path)
    const methods = builder as unknown as Record<
      RouteMethod,
      (handler: Handler, ...options: unknown[]) => RouteBuilder
    >

    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const originalMethod = methods[method]
      methods[method] = (handler, ...options) => {
        const operation = `${method.toUpperCase()}:${path}`
        const handlerWithContractCheck: Handler = async ctx => {
          ctx.requestContractOperation = operation
          await handler(ctx)

          if (!requestContractNeedsValidation(operation, registry) || ctx.requestContractValidated)
            return

          const error = createMissingValidationError(operation)
          report(error)
          if (ctx.res.headersSent || ctx.response.sent) return

          ctx.setStatus(500)
          ctx.json({
            message: 'Request validation did not run',
            code: REQUEST_CONTRACT_VALIDATION_MISSING,
          })
        }

        return Reflect.apply(originalMethod, builder, [handlerWithContractCheck, ...options])
      }
    }

    return builder
  }
}

export function assertRequestContractOperation(ctx: Context, operation: string): void {
  if (ctx.requestContractOperation !== operation) {
    throw new Error(
      `Request contract operation mismatch: request is ${ctx.requestContractOperation ?? 'unknown'}, validation used ${operation}`,
    )
  }
}

export function markRequestContractValidated(ctx: Context): void {
  ctx.requestContractValidated = true
}

export function requestContractNeedsValidation(
  operation: string,
  registry = RuntimeRequestValidatorRegistry.shared,
): boolean {
  return (
    !Object.hasOwn(REQUEST_CONTRACT_EXEMPTIONS, operation) && registry.hasInputCarriers(operation)
  )
}

function createMissingValidationError(operation: string): RequestContractError {
  return Object.assign(new Error(`Request contract validation did not run for ${operation}`), {
    code: REQUEST_CONTRACT_VALIDATION_MISSING,
    status: 500,
    tags: { route_key: operation },
  })
}
