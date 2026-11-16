import type { PrivateUser } from '../../../services/users/types.mts'
import {
  acknowledgeEuCopyrightNotice,
  acknowledgeUkCopyrightNotice,
  receiveEuCopyrightNotice,
  receiveUkCopyrightNotice,
  recordCopyrightJurisdictionPolicyApproval,
  recordEuCopyrightStatementOfReasons,
  recordUkCopyrightReview,
} from '../../../services/copyright-notices/index.mts'
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
  },
  uk: {
    receive: receiveUkCopyrightNotice,
    acknowledge: acknowledgeUkCopyrightNotice,
    determine: recordUkCopyrightReview,
  },
} as const

export function territorialNoticeBody(jurisdiction: TerritorialJurisdiction = 'uk') {
  const suffix = crypto.randomUUID()
  return {
    contact: `claimant-${suffix}@example.test`,
    content_description: `Work ${suffix}`,
    grounds: `Grounds ${suffix}`,
    hosted_use_url: `https://example.test/${suffix}`,
    ...(jurisdiction === 'eu_dsa'
      ? {
          notifier_name: `Notifier ${suffix}`,
          notifier_email: `notifier-${suffix}@example.test`,
          has_good_faith_statement: true as const,
        }
      : {}),
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

export type TerritorialUsers = {
  claimant: PrivateUser
  stranger: PrivateUser
  staff: PrivateUser
  administrator: PrivateUser
}

/** A claimant, an unrelated member, a moderator, and an administrator. No HTTP client is created,
 * so Playwright specs can import this without starting the API test server in the runner. */
export async function createTerritorialUsers(): Promise<TerritorialUsers> {
  const [claimant, stranger, staff, administrator] = await Promise.all([
    createTestUser(),
    createTestUser(),
    createTestUser({ extraRoles: ['moderator'] }),
    createTestUser({ administrator: true }),
  ])
  return { claimant, stranger, staff, administrator }
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
  const body = territorialNoticeBody(jurisdiction)
  const request = serviceNotice(body)
  const requester = { user: claimant, identity: `user:${claimant.id}` }
  const receipt =
    jurisdiction === 'eu_dsa'
      ? await receiveEuCopyrightNotice(requester, crypto.randomUUID(), {
          ...request,
          notifierName: `Notifier ${claimant.id}`,
          notifierEmail: request.contact,
          goodFaithStatement: true,
        })
      : await receiveUkCopyrightNotice(requester, crypto.randomUUID(), request)
  return receipt.notice_id
}

/** Records an acknowledged notice that staff has already given reasons for. */
export async function seedDeterminedTerritorialNotice(
  jurisdiction: TerritorialJurisdiction,
  actors: Pick<TerritorialUsers, 'claimant' | 'staff'>,
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
