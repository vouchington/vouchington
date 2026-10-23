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
// charged atomically per route, so a refused batch does not partially spend the REST-shared budget.
export async function chargeMcpToolCalls(
  plan: McpCallPlan,
  { identities, owner }: RouteRateLimitSubject,
): Promise<ChargedMcpCalls> {
  const events = [...plan.events]
  const callEvents: number[] = []
  const impossibleCosts = new Set<string>()
  const charges = plan.charges.flatMap(({ eventIndex, routeCharges }) =>
    routeCharges.map(({ routeKeys, weight }) => {
      const index = callEvents.push(eventIndex) - 1
      return { index, routeKeys, weight }
    }),
  )
  const refusedCalls = await chargeRoutes(charges, async (routeKey, cost) => {
    const result = await checkRouteRateLimit(routeKey, identities, owner, { cost })
    if (result.limited && cost !== undefined && cost >= result.limit) {
      impossibleCosts.add(`${routeKey}\0${cost}`)
    }
    return result
  })
  const rateLimitedCalls = new Map<number, { retryAfterSeconds: number; message?: string }>()
  for (const [chargeIndex, retryAfterSeconds] of refusedCalls) {
    const eventIndex = callEvents[chargeIndex]
    if (eventIndex === undefined) continue
    const charge = charges[chargeIndex]
    const message =
      charge?.weight !== undefined &&
      charge.routeKeys.some(routeKey => impossibleCosts.has(`${routeKey}\0${charge.weight}`))
        ? 'This batch exceeds the route limit. Split the batch into fewer calls and retry.'
        : undefined
    const prior = rateLimitedCalls.get(eventIndex)
    rateLimitedCalls.set(eventIndex, {
      retryAfterSeconds: Math.max(prior?.retryAfterSeconds ?? 0, retryAfterSeconds),
      ...(prior?.message || message ? { message: prior?.message ?? message } : {}),
    })
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
