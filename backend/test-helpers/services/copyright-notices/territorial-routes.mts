import type { PrivateUser } from '../../../services/users/types.mts'
import {
  acknowledgeEuCopyrightNotice,
  acknowledgeUkCopyrightNotice,
  receiveEuCopyrightNotice,
  receiveUkCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  recordEuCopyrightStatementOfReasons,
  recordUkCopyrightReview,
  submitEuCopyrightRedress,
  submitUkCopyrightRedress,
} from '../../../services/copyright-notices/index.mts'
import { createRequest } from '../../api/server.mts'
import { createTestUser } from '../../entities/users.mts'

export type TerritorialJurisdiction = 'eu_dsa' | 'uk'

/** The routes the EU and UK claimant and staff handlers share, keyed by jurisdiction. */
export type TerritorialSurface = {
  label: 'EU' | 'UK'
  jurisdiction: TerritorialJurisdiction
  base: string
  receiptField: 'copyright_eu_notice' | 'copyright_uk_notice'
  redressField: 'copyright_eu_redress_request' | 'copyright_uk_redress_request'
  /** The reason-giving step a redress request follows: a statement of reasons or a review. */
  determinationPath: 'statements-of-reasons' | 'reviews'
  determinationField: 'statement' | 'rationale'
  /** The notice-shape counter that proves the determination was or was not recorded. */
  determinationCount: 'eu_statement_count' | 'uk_review_count'
}

export const TERRITORIAL_SURFACES: TerritorialSurface[] = [
  {
    label: 'EU',
    jurisdiction: 'eu_dsa',
    base: '/api/v1/copyright-eu-notices',
    receiptField: 'copyright_eu_notice',
    redressField: 'copyright_eu_redress_request',
    determinationPath: 'statements-of-reasons',
    determinationField: 'statement',
    determinationCount: 'eu_statement_count',
  },
  {
    label: 'UK',
    jurisdiction: 'uk',
    base: '/api/v1/copyright-uk-notices',
    receiptField: 'copyright_uk_notice',
    redressField: 'copyright_uk_redress_request',
    determinationPath: 'reviews',
    determinationField: 'rationale',
    determinationCount: 'uk_review_count',
  },
]

const SERVICES = {
  eu_dsa: {
    receive: receiveEuCopyrightNotice,
    acknowledge: acknowledgeEuCopyrightNotice,
    determine: recordEuCopyrightStatementOfReasons,
    redress: submitEuCopyrightRedress,
  },
  uk: {
    receive: receiveUkCopyrightNotice,
    acknowledge: acknowledgeUkCopyrightNotice,
    determine: recordUkCopyrightReview,
    redress: submitUkCopyrightRedress,
  },
} as const

export function territorialNoticeBody() {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    content_description: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hosted_use_url: `https://example.test/${suffix}`,
  }
}

function serviceNotice(body: ReturnType<typeof territorialNoticeBody>) {
  return {
    contact: body.contact,
    contentDescription: body.content_description,
    grounds: body.grounds,
    hostedUseUrl: body.hosted_use_url,
  }
}

type TestAgent = ReturnType<typeof createRequest>

async function agentFor(user: PrivateUser): Promise<TestAgent> {
  const agent = createRequest()
  await agent.authenticateAs(user)
  return agent
}

export type TerritorialActors = {
  claimant: PrivateUser
  stranger: PrivateUser
  staff: PrivateUser
  administrator: PrivateUser
  anonymousRequest: TestAgent
  claimantRequest: TestAgent
  strangerRequest: TestAgent
  staffRequest: TestAgent
  administratorRequest: TestAgent
}

/** A claimant, an unrelated member, a moderator, and an administrator, each with a session. */
export async function createTerritorialActors(): Promise<TerritorialActors> {
  const [claimant, stranger, staff, administrator] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  const [claimantRequest, strangerRequest, staffRequest, administratorRequest] = await Promise.all([
    agentFor(claimant),
    agentFor(stranger),
    agentFor(staff),
    agentFor(administrator),
  ])
  return {
    claimant,
    stranger,
    staff,
    administrator,
    anonymousRequest: createRequest(),
    claimantRequest,
    strangerRequest,
    staffRequest,
    administratorRequest,
  }
}

/** Approves a fresh policy version so the jurisdiction accepts intake. Approvals are shared and
 * permanent in the test database, exactly as the existing route tests leave them. */
export async function approveJurisdictionPolicy(
  administrator: PrivateUser,
  jurisdiction: TerritorialJurisdiction,
) {
  return recordCopyrightJurisdictionPolicyApproval(administrator, {
    jurisdiction,
    policyVersion: `${jurisdiction.slice(0, 2)}-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  })
}

/** Records a notice without acknowledging it, so staff can record an acknowledgment failure. */
export async function seedPendingTerritorialNotice(
  jurisdiction: TerritorialJurisdiction,
  claimant: PrivateUser,
): Promise<string> {
  const receipt = await SERVICES[jurisdiction].receive(
    claimant,
    crypto.randomUUID(),
    serviceNotice(territorialNoticeBody()),
  )
  return receipt.notice_id
}

/** Records an acknowledged notice that staff has already given reasons for. */
export async function seedDeterminedTerritorialNotice(
  jurisdiction: TerritorialJurisdiction,
  actors: Pick<TerritorialActors, 'claimant' | 'staff'>,
): Promise<string> {
  const services = SERVICES[jurisdiction]
  const noticeId = await seedPendingTerritorialNotice(jurisdiction, actors.claimant)
  await services.acknowledge(actors.claimant, noticeId)
  await services.determine(actors.staff, noticeId, {
    text: `Staff reasons ${crypto.randomUUID()}`,
    publicExplanation: 'We reviewed the notice and took no action.',
    outcome: 'no_action',
    targets: [],
  })
  return noticeId
}

/** A determined notice and the claimant's redress request against it. */
export async function seedTerritorialRedress(
  jurisdiction: TerritorialJurisdiction,
  actors: Pick<TerritorialActors, 'claimant' | 'staff'>,
): Promise<{ noticeId: string; redressId: string }> {
  const noticeId = await seedDeterminedTerritorialNotice(jurisdiction, actors)
  const redress = await SERVICES[jurisdiction].redress(
    actors.claimant,
    noticeId,
    crypto.randomUUID(),
    'Please review this restriction',
  )
  return { noticeId, redressId: redress.id }
}
