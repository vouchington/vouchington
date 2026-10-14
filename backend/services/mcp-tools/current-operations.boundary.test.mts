import { randomUUID } from 'node:crypto'
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SCOPE_DEFINITIONS, withScopePrerequisites, type ApiScope } from '@modules/scopes'
import { createTestUser } from '@voucha/test-helpers'
import { issueTestUserMcpCredential } from '@voucha/test-helpers/mcp-user-credentials'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  readTestMcpCallAuditEvents,
  readTestMcpCallAuditOptions,
} from '@voucha/test-helpers/entities/mcp-call-audit'
import {
  overrideDynamicConfigFieldsForTest,
  closeScopedDynamicConfigContext,
} from '@voucha/test-helpers/dynamic-config'
import {
  routeRateLimitConfig,
  getRouteConfig,
  isRouteRateLimitEnabled,
} from '../route-rate-limits/config.mts'
import { buildRateLimitKeys } from '../route-rate-limits/identity.mts'
import { routeRateLimiters } from '../route-rate-limits/check.mts'
import { chargeMcpToolCalls } from '../../api/mcp-route-rate-limit-helpers.mts'
import { callMcpTool } from './call-tool.mts'
import { planMcpCalls } from './classify-calls.mts'
import { createMcpCallAuditContext, recordMcpCallAudit } from './audit.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'
import { currentOperationCases, type OperationCase } from '@voucha/test-helpers/mcp-operation-cases'

const CASES = currentOperationCases()
const ALL_SCOPES = withScopePrerequisites(Object.keys(SCOPE_DEFINITIONS) as ApiScope[])
const SENTINEL_ROUTE = 'GET:/api/v1/posts'

type Actor = {
  user: Awaited<ReturnType<typeof createTestUser>> & { membership_plan: 'pro' | null }
  credential:
    | { credential: 'oauth'; oauthClientId: string }
    | { credential: 'api_key'; apiKeyId: string }
  identity: { oauth_client_id: string | null; api_key_id: string | null }
}
const userActors: Actor[] = []
let adminActor: Actor
let restoreEnabled: () => void

function call(row: OperationCase, input: Record<string, unknown>, id: number) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name: row.name, arguments: input } }
}
function selectedConfig(row: OperationCase) {
  return row.surface === 'mcp' ? USER_MCP_SERVER_CONFIG : ADMIN_MCP_SERVER_CONFIG
}
function counter(routeKey: string, identities: { ip: string }) {
  const category = getRouteConfig(routeKey).category
  return routeRateLimiters[category].get(buildRateLimitKeys(routeKey, identities))
}
async function expectCounts(
  routeKeys: readonly string[],
  identities: { ip: string },
  count: number,
) {
  for (const key of routeKeys) expect(await counter(key, identities)).toEqual([count])
}
async function persistAndCheck(
  row: OperationCase,
  actor: Actor,
  event: ReturnType<typeof planMcpCalls>['events'][number],
) {
  const context = createMcpCallAuditContext(selectedConfig(row), actor.user.id, actor.credential)
  await recordMcpCallAudit(context, [event])
  const options = (await readTestMcpCallAuditOptions(actor.user.id)).filter(
    value => value.correlation_id === context.correlationId,
  )
  expect(options).toEqual([
    {
      correlation_id: context.correlationId,
      tool_name: row.name,
      tool_option: row.option,
      outcome: event.outcome,
    },
  ])
  const rows = (await readTestMcpCallAuditEvents(actor.user.id)).filter(
    value => value.correlation_id === context.correlationId,
  )
  expect(rows).toEqual([
    expect.objectContaining({
      surface: row.surface,
      actor_user_id: actor.user.id,
      ...actor.identity,
      jsonrpc_method: 'tools/call',
      tool_name: row.name,
      outcome: event.outcome,
    }),
  ])
}

describe('every current MCP operation: planning, real route charge, and durable audit', () => {
  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
    routeRateLimitConfig.unsubscribe()
    restoreEnabled = overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: true })
    if (!isRouteRateLimitEnabled()) throw new Error('Route-limit override did not activate')
    for (const kind of ['oauth', 'api_key'] as const) {
      const issued = await issueTestUserMcpCredential(kind, 'topics:read')
      userActors.push({
        user: { ...issued.user, membership_plan: 'pro' },
        credential:
          kind === 'oauth'
            ? { credential: 'oauth', oauthClientId: issued.identity.oauth_client_id! }
            : { credential: 'api_key', apiKeyId: issued.identity.api_key_id! },
        identity: issued.identity,
      })
    }
    const user = await createTestUser({ administrator: true })
    const issued = await issueTestOAuthTokensForClient(user, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    adminActor = {
      user: { ...user, membership_plan: null },
      credential: { credential: 'oauth', oauthClientId: issued.clientId },
      identity: { oauth_client_id: issued.clientId, api_key_id: null },
    }
  })
  afterAll(async () => {
    restoreEnabled?.()
    await closeScopedDynamicConfigContext([routeRateLimitConfig])
  })

  it.each(CASES)('$surface $name $option: accepted, denied, malformed', async row => {
    const actor =
      row.surface === 'admin_mcp' ? adminActor : userActors[CASES.indexOf(row) % userActors.length]!
    const config = selectedConfig(row)
    const identities = { ip: `2001:db8:2497::${randomUUID()}` }
    const routeKeys = [...new Set(row.routes)]
    const keyToInspect = routeKeys.length ? routeKeys : [SENTINEL_ROUTE]
    await expectCounts(keyToInspect, identities, 0)

    const acceptedPlan = planMcpCalls(call(row, row.input, 1), actor.user, ALL_SCOPES, config, true)
    expect(acceptedPlan.events).toEqual([
      expect.objectContaining({
        jsonrpcMethod: 'tools/call',
        toolName: row.name,
        ...(row.option ? { option: row.option } : {}),
        outcome: 'accepted',
      }),
    ])
    expect(acceptedPlan.charges).toEqual(
      routeKeys.length ? [{ eventIndex: 0, requestId: 1, routeKeys }] : [],
    )
    const charged = await chargeMcpToolCalls(acceptedPlan, { identities, owner: actor.user })
    expect(charged.events).toEqual(acceptedPlan.events)
    expect(charged.rateLimitedCalls.size).toBe(0)
    await expectCounts(keyToInspect, identities, routeKeys.length ? 1 : 0)
    await persistAndCheck(row, actor, charged.events[0]!)

    const deniedPlan = planMcpCalls(call(row, row.input, 2), actor.user, [], config, true)
    expect(deniedPlan.events).toEqual([
      expect.objectContaining({
        toolName: row.name,
        outcome: 'insufficient_scope',
        ...(row.option ? { option: row.option } : {}),
      }),
    ])
    expect(deniedPlan.charges).toEqual([])
    await expect(
      callMcpTool(row.name, row.input, actor.user, [], config, true),
    ).rejects.toMatchObject({
      code: ErrorCode.InvalidRequest,
      message: expect.stringContaining('requires scopes'),
    })
    const deniedCharged = await chargeMcpToolCalls(deniedPlan, { identities, owner: actor.user })
    expect(deniedCharged.events).toEqual(deniedPlan.events)
    expect(deniedCharged.rateLimitedCalls.size).toBe(0)
    await expectCounts(keyToInspect, identities, routeKeys.length ? 1 : 0)
    await persistAndCheck(row, actor, deniedCharged.events[0]!)

    for (const invalidInput of [
      { ...row.input, extra: true },
      ...(row.option
        ? [
            {
              ...row.input,
              arguments: {
                ...(row.input['arguments'] as Record<string, unknown>),
                extra: true,
              },
            },
          ]
        : []),
    ]) {
      const invalidPlan = planMcpCalls(
        call(row, invalidInput, 3),
        actor.user,
        ALL_SCOPES,
        config,
        true,
      )
      expect(invalidPlan.events).toEqual([
        expect.objectContaining({
          toolName: row.name,
          outcome: 'invalid_arguments',
          ...(row.option ? { option: row.option } : {}),
        }),
      ])
      expect(invalidPlan.charges).toEqual([])
      await expect(
        callMcpTool(row.name, invalidInput, actor.user, ALL_SCOPES, config, true),
      ).rejects.toMatchObject({
        code: ErrorCode.InvalidParams,
        message: expect.stringContaining('Invalid tool arguments'),
      })
      const invalidCharged = await chargeMcpToolCalls(invalidPlan, {
        identities,
        owner: actor.user,
      })
      expect(invalidCharged.events).toEqual(invalidPlan.events)
      expect(invalidCharged.rateLimitedCalls.size).toBe(0)
      await expectCounts(keyToInspect, identities, routeKeys.length ? 1 : 0)
      await persistAndCheck(row, actor, invalidCharged.events[0]!)
    }
  })
})
