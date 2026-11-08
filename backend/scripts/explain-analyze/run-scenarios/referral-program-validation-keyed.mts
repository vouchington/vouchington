import assert from 'node:assert/strict'
import { getReferralLinkValidationForProgram } from '@services/referral-program-link-validations/get-for-program'
import { PROGRAM_VALIDATION_HYDRATION_LIMIT } from '@services/referral-program-link-validations/list'
import { getReferralProgramAttributes } from '@services/topics/referral-programs'
import type { Topic } from '@services/topics/types'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

export async function captureReferralValidationKeyed(input: {
  programId: string
  hitId: string
  foreignId: string
  missingId: string
  hitSlug: string
  foreignSlug: string
  seededBindings: number
  seededValidations: number
}): Promise<void> {
  const cases = [
    { id: 'referral-program-validation-key-hit', validation: input.hitId, hit: true },
    { id: 'referral-program-validation-key-missing', validation: input.missingId, hit: false },
    { id: 'referral-program-validation-key-foreign', validation: input.foreignId, hit: false },
    {
      id: 'referral-program-validation-slug-hit',
      validation: input.hitSlug,
      expectedId: input.hitId,
      hit: true,
      slug: true,
    },
    {
      id: 'referral-program-validation-slug-missing',
      validation: 'explain_program_validation_missing',
      hit: false,
      slug: true,
    },
    {
      id: 'referral-program-validation-slug-foreign',
      validation: input.foreignSlug,
      hit: false,
      slug: true,
    },
  ] as const
  for (const scenario of cases) {
    registerScenarioContract(scenario.id, {
      allowEmptyResult: !scenario.hit,
      expectations: [
        ...('slug' in scenario
          ? [
              {
                kind: 'usesIndexes' as const,
                indexes: [
                  'referral_program_link_validation_rule_sets_slug_key',
                  'idx_referral_program_link_validation_rule_sets__slug_prefix',
                ],
                anyOf: true,
              },
            ]
          : []),
        {
          kind: 'maxProcessedRows',
          relation: 'referral_program_topic_link_validation_rule_sets',
          max: PROGRAM_VALIDATION_HYDRATION_LIMIT,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'referral_program_link_validation_rule_sets',
          max: PROGRAM_VALIDATION_HYDRATION_LIMIT,
        },
        { kind: 'maxBitmapIndexRows', max: PROGRAM_VALIDATION_HYDRATION_LIMIT },
      ],
      seededRows: {
        referral_program_topic_link_validation_rule_sets: input.seededBindings,
        referral_program_link_validation_rule_sets: input.seededValidations,
      },
    })
    // no-mistakes-disable-next-line query-reached-per-item: fixed UUID and slug probes capture separate plans.
    await runAndCapture(scenario.id, async () => {
      const result = await getReferralLinkValidationForProgram(input.programId, scenario.validation)
      assert.equal(
        result?.id ?? null,
        scenario.hit
          ? 'expectedId' in scenario
            ? scenario.expectedId
            : scenario.validation
          : null,
      )
    })
  }
  registerScenarioContract('referral-program-attributes-key', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'referral_program_topics', max: 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'referral_program_topic_link_validation_rule_sets',
        max: 0,
      },
    ],
    seededRows: { referral_program_topic_link_validation_rule_sets: input.seededBindings },
  })
  await runAndCapture(
    'referral-program-attributes-key',
    async () => {
      const attributes = await getReferralProgramAttributes({
        id: input.programId,
        topic_type: 'referral_program',
      } as Topic)
      assert.ok(attributes)
    },
    undefined,
    'getReferralProgramAttributes',
  )
}
