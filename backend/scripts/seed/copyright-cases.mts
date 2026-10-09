import type { CopyrightSeedContext } from './copyright-context.mts'
import { createHash } from 'node:crypto'
import {
  createCopyrightFormIntake,
  createCopyrightGuestIdentity,
} from '@services/copyright-notices'
import {
  claimCopyrightFormScreening,
  completeCopyrightFormScreening,
} from '@services/copyright-notices/form-screening-executions'
import {
  COPYRIGHT_FORM_GUIDANCE_ELEMENTS,
  type CopyrightFormGuidance,
} from '@services/copyright-notices/form-screening-guidance'
import type { CopyrightSeedMedia } from './copyright-media.mts'

export type CopyrightSeedCase = { noticeId: string; intakeId: string }

type SeedFormCase = {
  claimantDisplayName: string
  claimantEmail: string
  workDescription: string
  guidance: CopyrightFormGuidance
}

const allElements = (
  overrides: Partial<Record<(typeof COPYRIGHT_FORM_GUIDANCE_ELEMENTS)[number], string>>,
): CopyrightFormGuidance['elements'] =>
  COPYRIGHT_FORM_GUIDANCE_ELEMENTS.map(element => ({
    element,
    status: overrides[element] ? 'unclear' : 'present',
    gap: overrides[element] ?? null,
  }))

// Intake review is still open here, so the case waits on a moderator with gap-bearing guidance.
const intakeReviewCase: SeedFormCase = {
  claimantDisplayName: 'Marcus Lee',
  claimantEmail: 'marcus@lee-studio.example',
  workDescription: 'A harbour sunrise photograph I took in 2024 and licence through my studio.',
  guidance: {
    summary:
      'The claimant says they own an original photograph. The form covers every required element, ' +
      'but the work description does not say where the original was first published.',
    elements: allElements({
      work_identification: 'No publication venue or date is given, so ownership is unverified.',
    }),
    risk_notes: [
      {
        kind: 'possible_fair_use',
        note: 'The hosted post may be commentary on the photograph, which can weigh toward fair use.',
      },
    ],
    suggested_action: 'request_information',
  },
}

// Staff accepted this one and a counter notice followed, so only its overdue deadline queues it.
const deadlineCase: SeedFormCase = {
  claimantDisplayName: 'Priya Natarajan',
  claimantEmail: 'priya@natarajan-images.example',
  workDescription:
    'Editorial photograph of the harbour at sunrise, registered with a stock agency.',
  guidance: {
    summary: 'A complete notice from a claimant who names the stock agency that holds the work.',
    elements: allElements({}),
    risk_notes: [],
    suggested_action: 'approve_intake',
  },
}

/**
 * Files one guest form and completes its screening. Both calls are repeatable: the form intake
 * returns the stored record for a matching key, and the screening is claimed only while the
 * intake's execution is still pending, so a rerun never records a second screening or bumps the
 * attempt. Completing it here also keeps the local worker from calling a model for seed data.
 */
async function seedCopyrightFormCase(
  seed: SeedFormCase,
  media: CopyrightSeedMedia,
  identity: { idempotencyKey: string; ipAddress: string },
): Promise<CopyrightSeedCase> {
  const { intake } = await createCopyrightFormIntake({
    currentUser: null,
    requesterIdentity: createCopyrightGuestIdentity(identity.ipAddress),
    idempotencyKey: identity.idempotencyKey,
    request: {
      jurisdiction: 'us_dmca',
      claimantDisplayName: seed.claimantDisplayName,
      claimantContact: `${seed.claimantEmail}, 12 Quay Street, Portsmouth`,
      claimantEmail: seed.claimantEmail,
      workDescription: seed.workDescription,
      goodFaithBelief: true,
      accuracyAuthorityUnderPenaltyOfPerjury: true,
      electronicSignature: seed.claimantDisplayName,
      claimantTargets: [
        {
          surfaceKind: 'post-image',
          postId: media.postId,
          imageId: media.imageId,
          hostedUseUrl: media.hostedUseUrl,
        },
      ],
    },
  })
  const attempt = await claimCopyrightFormScreening(intake.id)
  if (attempt) {
    await completeCopyrightFormScreening(attempt, {
      intakeId: intake.id,
      inputSha256: createHash('sha256').update(identity.idempotencyKey).digest(),
      recommendation: 'not_obviously_invalid',
      rationale: 'No spam or abuse markers; the notice reads as a genuine ownership claim.',
      guidance: seed.guidance,
      promptVersion: 'copyright-form-screening-v3',
      model: 'dev-seed',
    })
  }
  return { noticeId: intake.copyright_notice_id, intakeId: intake.id }
}

export async function seedCopyrightCases(
  media: CopyrightSeedMedia,
  { identity }: CopyrightSeedContext,
) {
  return {
    intakeReviewCase: await seedCopyrightFormCase(intakeReviewCase, media, {
      idempotencyKey: identity.intakeReviewKey,
      ipAddress: identity.intakeIpAddress,
    }),
    deadlineCase: await seedCopyrightFormCase(deadlineCase, media, {
      idempotencyKey: identity.deadlineKey,
      ipAddress: identity.deadlineIpAddress,
    }),
  }
}
