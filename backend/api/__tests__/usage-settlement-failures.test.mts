import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readApiUsageRows } from '@voucha/test-helpers/api-usage-analytics'
import {
  registerRestUsageRoutes,
  useRestUsageMetering,
  usageQuotaKeys,
} from '@voucha/test-helpers/rest-usage-meter'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import {
  registerFailingUsageResolverRoute,
  withUsageSettlementFailureObservation,
} from '@voucha/test-helpers/usage-settlement-failures'
import { onResponseUsageSettlement } from '../usage-meter-helpers.mts'

const BASE = `/api/v1/__tests__/usage-failure-${crypto.randomUUID()}`
const resolverFailure = new Error('Owned units resolver failed')
registerRestUsageRoutes(BASE)
registerFailingUsageResolverRoute(`${BASE}/resolver`, resolverFailure)

describe('HTTP usage settlement failure isolation', () => {
  useRestUsageMetering('usage-settlement-failure-')

  it('continues listeners and real settlement when both observers and Sentry reporting fail', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const observerFailure = new Error('Owned usage observer failed')
    const reporterFailure = new Error('Owned Sentry report failed')
    const privateQuery = crypto.randomUUID()
    let tailVisited = false
    await withUsageSettlementFailureObservation(
      user.id,
      restore => {
        const previous = sentryCaptureExceptionMock.getMockImplementation()
        restore(() => sentryCaptureExceptionMock.mockImplementation(previous ?? (() => undefined)))
        sentryCaptureExceptionMock.mockImplementation((...args) => {
          if (args[0] === observerFailure) throw reporterFailure
          return previous?.(...args)
        })
        for (let index = 0; index < 2; index++) {
          restore(
            onResponseUsageSettlement(event => {
              if (event.ownerUserId === user.id) throw observerFailure
              return undefined
            }),
          )
        }
        restore(
          onResponseUsageSettlement(event => {
            if (event.ownerUserId === user.id) tailVisited = true
            return undefined
          }),
        )
      },
      () => request.get(`${BASE}/ok?private=${privateQuery}`).expect(200),
      async (response, events) => {
        expect(response.body).toEqual({ ok: true })
        expect(events).toHaveLength(1)
        const event = events[0]!
        expect(event.ownerUserId).toBe(user.id)
        expect(event.pathname).toBe(`${BASE}/ok`)
        expect(event).not.toHaveProperty('request')
        expect(JSON.stringify(event)).not.toContain(privateQuery)
        expect(JSON.stringify(event)).not.toContain(request.authCookie)
        await expect(event.completion).resolves.toEqual({ status: 'fulfilled', value: undefined })
        expect(tailVisited).toBe(true)
        expect(event.observerErrors).toHaveLength(4)
        for (const [index, failure] of [
          observerFailure,
          reporterFailure,
          observerFailure,
          reporterFailure,
        ].entries())
          expect(event.observerErrors[index]).toBe(failure)
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === observerFailure),
        ).toHaveLength(2)
        const rows = await readApiUsageRows(user.id)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({ user_id: user.id, status_code: 200, units: 1 })
      },
    )
  })

  it('retains the exact units failure after successful HTTP close without charging usage', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    await withUsageSettlementFailureObservation(
      user.id,
      () => {},
      () => request.get(`${BASE}/resolver`).expect(200),
      async (response, events) => {
        expect(response.body).toEqual({ ok: true })
        expect(events).toHaveLength(1)
        const event = events[0]!
        expect(event.ownerUserId).toBe(user.id)
        expect(event.pathname).toBe(`${BASE}/resolver`)
        const outcome = await event.completion
        expect(outcome.status).toBe('rejected')
        if (outcome.status !== 'rejected') throw new Error('Expected failed units resolution')
        expect(outcome.reason).toBe(resolverFailure)
        expect(event.observerErrors).toEqual([])
        expect(await readApiUsageRows(user.id)).toEqual([])
        expect((await usageQuotaKeys()).filter(key => key.includes(user.id))).toEqual([])
      },
    )
  })
})
