import type { McpCallAuditEvent, McpCallPlan } from '@services/mcp-tools'
import { checkRouteRateLimit } from '@services/route-rate-limits'
import { chargeRoutes } from '@vouchington/rate-limit'

type RouteRateLimitSubject = {
  identities: Parameters<typeof checkRouteRateLimit>[1]
  owner: Parameters<typeof checkRouteRateLimit>[2]
}

export type ChargedMcpCalls = {
  // The planned audit events, with each refused call recorded as `rate_limited`.
  events: McpCallAuditEvent[]
  // The retry delay of each refused call, by original message index.
  rateLimitedCalls: ReadonlyMap<number, { retryAfterSeconds: number; message?: string }>
}

// Charges every `tools/call` to the bucket of each REST route it exercises. Weighted batches are
// charged atomically per route, and later routes for a refused call are left untouched.
export async function chargeMcpToolCalls(
  plan: McpCallPlan,
  { identities, owner }: RouteRateLimitSubject,
): Promise<ChargedMcpCalls> {
  const events = [...plan.events]
  const rateLimitedCalls = new Map<number, { retryAfterSeconds: number; message?: string }>()
  for (const { eventIndex, routeCharges } of plan.charges) {
    for (const routeCharge of routeCharges) {
      let message: string | undefined
      // Each tool call stops charging as soon as one of its ordered route charges is refused.
      // oxlint-disable-next-line no-await-in-loop -- route charging must preserve per-call route order
      const refusedCharge = await chargeRoutes(
        [{ index: eventIndex, ...routeCharge }],
        async (routeKey, cost) => {
          const result = await checkRouteRateLimit(routeKey, identities, owner, { cost })
          if (result.limited && cost !== undefined && cost >= result.limit) {
            message =
              'This batch exceeds the route limit. Split the batch into fewer calls and retry.'
          }
          return result
        },
      )
      const retryAfterSeconds = refusedCharge.get(eventIndex)
      if (retryAfterSeconds === undefined) continue
      rateLimitedCalls.set(eventIndex, {
        retryAfterSeconds,
        ...(message === undefined ? {} : { message }),
      })
      break
    }
  }
  for (const [eventIndex] of rateLimitedCalls) {
    // The refusal is the whole outcome, so a copyright rationale (stored only for an accepted
    // call) is not carried onto the row.
    const { jsonrpcMethod, toolName, option } = plan.events[eventIndex] as McpCallAuditEvent
    events[eventIndex] = {
      jsonrpcMethod,
      toolName,
      ...(option === undefined ? {} : { option }),
      outcome: 'rate_limited',
    }
  }
  return { events, rateLimitedCalls }
}
