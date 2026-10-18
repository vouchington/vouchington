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
  rateLimitedCalls: ReadonlyMap<number, number>
}

// Charges every `tools/call` that will run to the bucket of each REST route it exercises, under the
// identities its REST twin is charged with, so one user has one budget per route across both
// protocols. A batch of N calls charges N times: this is per call, not per HTTP request. A call
// stops at the first route whose bucket is spent, as the REST handler does, and is refused.
// Charges run one after another so a batch spends its budget in order.
export async function chargeMcpToolCalls(
  plan: McpCallPlan,
  { identities, owner }: RouteRateLimitSubject,
): Promise<ChargedMcpCalls> {
  const events = [...plan.events]
  const rateLimitedCalls = await chargeRoutes(
    plan.charges.map(({ eventIndex, routeKeys }) => ({ index: eventIndex, routeKeys })),
    routeKey => checkRouteRateLimit(routeKey, identities, owner),
  )
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
