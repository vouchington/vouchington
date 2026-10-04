import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

const KILL_SWITCH_MESSAGE = 'Copyright intake is not available'

// COPYRIGHT_INTAKE_ENABLED closes new claimant intake only (#1210): the notice forms and staff
// approval of an emailed notice, which would open a new case. Email is still ingested and reviewed
// while it is off (#1443). In-case responses carry statutory clocks (§512(g) counter-notices and
// court/CCB filings, DSA and UK redress) and the other staff decisions keep existing cases moving,
// so both stay open.
const routeClasses = {
  newIntake: [
    'POST:/api/v1/copyright-notices',
    'POST:/api/v1/copyright-eu-notices',
    'POST:/api/v1/copyright-uk-notices',
    'POST:/api/v1/copyright-email-intakes/:id/approvals',
  ],
  inCaseResponse: [
    'POST:/api/v1/copyright-notices/:id/appeals',
    'POST:/api/v1/copyright-notices/:id/counter-notices',
    'POST:/api/v1/copyright-notices/:id/guest-filings',
    'POST:/api/v1/copyright-eu-notices/:id/redress-requests',
    'POST:/api/v1/copyright-eu-notices/:id/supervised-complaints',
    'POST:/api/v1/copyright-uk-notices/:id/redress-requests',
  ],
  staff: [
    'POST:/api/v1/copyright-email-intakes/:id/correspondence',
    'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
    'POST:/api/v1/copyright-email-intakes/:id/legal-process',
    'POST:/api/v1/copyright-email-intakes/:id/rejections',
    'POST:/api/v1/copyright-email-intakes/:id/reply/replays',
    'POST:/api/v1/copyright-eu-notices/:id/acknowledgment-failures',
    'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements',
    'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/outcomes',
    'POST:/api/v1/copyright-eu-notices/:id/dispute-settlements/:referralId/implementations',
    'POST:/api/v1/copyright-eu-notices/:id/redress-requests/:redressId/decisions',
    'POST:/api/v1/copyright-eu-notices/:id/statements-of-reasons',
    'POST:/api/v1/copyright-eu-reports',
    'POST:/api/v1/copyright-form-intakes/:id/reviews',
    'POST:/api/v1/copyright-jurisdiction-policies',
    'POST:/api/v1/copyright-jurisdiction-policies/:id/withdrawals',
    'POST:/api/v1/copyright-legal-hold-assessments/:id/resolutions',
    'POST:/api/v1/copyright-media-delivery/replays',
    'POST:/api/v1/copyright-notices/:id/action-intents/:intentId/replays',
    'POST:/api/v1/copyright-notices/:id/delivery-intents/:intentId/replays',
    'POST:/api/v1/copyright-notices/:id/guest-capabilities',
    'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/information-requests',
    'POST:/api/v1/copyright-notices/:id/guest-capabilities/:capabilityId/revocation',
    'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts',
    'POST:/api/v1/copyright-notices/:id/restrictions/:restrictionId/reviews',
    'POST:/api/v1/copyright-notices/:id/staydown-matches/:matchId/reviews',
    'POST:/api/v1/copyright-repeat-infringer-accounts/:accountUserId/reinstatements',
    'POST:/api/v1/copyright-repeat-infringer-incidents/:id/dispositions',
    'POST:/api/v1/copyright-repeat-infringer-reviews/:id/outcomes',
    'POST:/api/v1/copyright-submissions/:id/appeal-reviews',
    'POST:/api/v1/copyright-submissions/:id/counter-notice-reviews',
    'POST:/api/v1/copyright-submissions/:id/legal-hold-assessments',
    'POST:/api/v1/copyright-trusted-flaggers',
    'POST:/api/v1/copyright-trusted-flaggers/:id/status-changes',
    'POST:/api/v1/copyright-uk-notices/:id/acknowledgment-failures',
    'POST:/api/v1/copyright-uk-notices/:id/redress-requests/:redressId/decisions',
    'POST:/api/v1/copyright-uk-notices/:id/reviews',
  ],
}
const openRoutes = [...routeClasses.inCaseResponse, ...routeClasses.staff]

const MUTATION_METHODS = new Set(['delete', 'patch', 'post', 'put'])
// The committed document lists every registered route; write-openapi.test.mts keeps it current.
const openApi = JSON.parse(
  readFileSync(new URL('../../../../api-fixtures/v1/openapi.json', import.meta.url), 'utf8'),
) as { paths: Record<string, Record<string, unknown>> }
const registeredRoutes = Object.entries(openApi.paths)
  .filter(([path]) => path.startsWith('/api/v1/copyright-'))
  .flatMap(([path, operations]) =>
    Object.keys(operations)
      .filter(method => MUTATION_METHODS.has(method))
      .map(method => `${method.toUpperCase()}:${path.replaceAll(/\{(\w+)\}/g, ':$1')}`),
  )

function classificationGaps(routes: string[]) {
  const counts = new Map<string, number>()
  for (const route of Object.values(routeClasses).flat()) {
    counts.set(route, (counts.get(route) ?? 0) + 1)
  }
  return {
    unclassified: routes.filter(route => !counts.has(route)),
    duplicated: [...counts].filter(([, count]) => count > 1).map(([route]) => route),
    stale: [...counts.keys()].filter(route => !routes.includes(route)),
  }
}

function send(agent: ReturnType<typeof createRequest>, route: string) {
  const separator = route.indexOf(':')
  const method = route.slice(0, separator).toLowerCase() as 'delete' | 'patch' | 'post' | 'put'
  const path = route.slice(separator + 1).replaceAll(/:\w+/g, () => crypto.randomUUID())
  return agent[method](path).send({})
}

// Staff and in-case probes run as a signed-in non-staff member, so they stop at authorization or
// validation instead of mutating shared cases (a staff media replay would drain every failure).
async function memberRequest() {
  const agent = createRequest()
  await agent.authenticateAs(await createTestUser())
  return agent
}

describe('copyright intake kill switch route classification', () => {
  it('classifies every non-GET copyright route into exactly one class', () => {
    expect(registeredRoutes.length).toBeGreaterThan(0)
    expect(classificationGaps(registeredRoutes)).toEqual({
      unclassified: [],
      duplicated: [],
      stale: [],
    })
    const added = 'POST:/api/v1/copyright-notices/:id/new-filings'
    expect(classificationGaps([...registeredRoutes, added]).unclassified).toEqual([added])
  })
})

describe('copyright routes with intake switched off', () => {
  useCopyrightIntakeEnvironment({ enabled: false })

  it.each(routeClasses.newIntake)('rejects new intake at %s before authentication', async route => {
    const response = await send(createRequest(), route)
    expect(response.status).toBe(503)
    expect(response.body.message).toBe(KILL_SWITCH_MESSAGE)
  })

  it.each(openRoutes)('keeps %s open', async route => {
    const response = await send(await memberRequest(), route)
    expect(response.status).not.toBe(503)
    expect(response.body.message).not.toBe(KILL_SWITCH_MESSAGE)
  })
})

describe('copyright routes with intake switched on', () => {
  useCopyrightIntakeEnvironment()

  it.each(routeClasses.newIntake)('lets %s past the intake guard', async route => {
    const response = await send(createRequest(), route)
    expect(response.status).not.toBe(503)
  })
})
