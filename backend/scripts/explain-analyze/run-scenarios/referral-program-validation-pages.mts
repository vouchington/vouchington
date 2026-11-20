import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import {
  PROGRAM_VALIDATION_HYDRATION_LIMIT,
  listReferralLinkValidationsForProgram,
} from '@services/referral-program-link-validations/list'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { runAndCapture } from '../run-support.mts'
import { runTopicLinkCountSortScenario } from './topic-link-count-sort.mts'
import { captureReferralValidationKeyed } from './referral-program-validation-keyed.mts'

const PAGE_SIZE = 25
const VALIDATION_COUNT = 2_048
const TARGET_STRIDE = 16
const FANOUT = 64
const programId = seedUuid(90_000, 'c9')
const otherProgramId = seedUuid(90_001, 'c9')
const emptyProgramId = seedUuid(90_002, 'c9')
const validationId = (index: number) => seedUuid(90_000 + index, 'ca')
const validationSlug = (index: number) =>
  `explain_program_validation_${String(index).padStart(5, '0')}`

async function seedProgramValidationPages(): Promise<void> {
  const fanoutPrograms = Array.from({ length: FANOUT }, (_, index) =>
    seedUuid(91_000 + index, 'c9'),
  )
  const programs = [programId, otherProgramId, emptyProgramId, ...fanoutPrograms]
  await write(
    `/* seedExplainProgramValidationTopics */
    INSERT INTO topics (id, topic_type, name, slug, gemini_embedding_2_content_sha256, created_via, bedrock_nova_multimodal_v1_content_sha256)
    SELECT id, 'referral_program', 'EXPLAIN validation program ' || ordinal,
      'explain-validation-program-' || ordinal, digest(id::text, 'sha256'), 'system'
    , digest(id::text, 'sha256') FROM unnest($1::uuid[]) WITH ORDINALITY AS seed(id, ordinal)
    ON CONFLICT (id) DO NOTHING`,
    [programs],
  )
  await write(
    `/* seedExplainProgramValidationPrograms */
    INSERT INTO referral_program_topics (topic_id, enabled_at)
    SELECT id, CURRENT_TIMESTAMP FROM unnest($1::uuid[]) id
    ON CONFLICT (topic_id) DO NOTHING`,
    [programs],
  )
  const ids = Array.from({ length: VALIDATION_COUNT }, (_, index) => validationId(index))
  const slugs = Array.from({ length: VALIDATION_COUNT }, (_, index) => validationSlug(index))
  const owners = Array.from({ length: VALIDATION_COUNT }, (_, index) =>
    index % TARGET_STRIDE === 0 ? programId : otherProgramId,
  )
  await write(
    `/* seedExplainProgramValidationSets */
    INSERT INTO referral_program_link_validation_rule_sets (id, slug)
    SELECT id, slug FROM unnest($1::uuid[], $2::text[]) seed(id, slug)
    ON CONFLICT (id) DO NOTHING`,
    [ids, slugs],
  )
  await write(
    `/* seedExplainProgramValidationBindings */
    INSERT INTO referral_program_topic_link_validation_rule_sets
      (referral_program_topic_id, referral_program_link_validation_rule_set_id)
    SELECT program_id, validation_id FROM unnest($1::uuid[], $2::uuid[]) seed(program_id, validation_id)
    ON CONFLICT DO NOTHING`,
    [owners, ids],
  )
  await write(
    `/* seedExplainProgramValidationFanout */
    INSERT INTO referral_program_topic_link_validation_rule_sets
      (referral_program_topic_id, referral_program_link_validation_rule_set_id)
    SELECT id, $2::uuid FROM unnest($1::uuid[]) id ON CONFLICT DO NOTHING`,
    [fanoutPrograms, validationId(VALIDATION_COUNT - TARGET_STRIDE)],
  )
  await write(`/* analyzeExplainProgramValidationPages */ ANALYZE
    referral_program_topic_link_validation_rule_sets, referral_program_link_validation_rule_sets`)
}

export async function runReferralValidationPages(): Promise<void> {
  await runTopicLinkCountSortScenario()
  await seedProgramValidationPages()
  const cases = [
    { id: 'referral-program-validation-page-first', program: programId },
    {
      id: 'referral-program-validation-page-continuation',
      program: programId,
      after: encodeCursor({
        id: validationId(VALIDATION_COUNT - TARGET_STRIDE * PAGE_SIZE),
      }),
    },
    { id: 'referral-program-validation-page-empty', program: emptyProgramId, empty: true },
  ] as const
  for (const scenario of cases) {
    // The composite junction primary key admits at most one binding per program and validation.
    registerScenarioContract(scenario.id, {
      allowEmptyResult: 'empty' in scenario,
      expectations: [
        {
          kind: 'maxProcessedRows',
          relation: 'referral_program_topic_link_validation_rule_sets',
          max: (PAGE_SIZE + 1) * PROGRAM_VALIDATION_HYDRATION_LIMIT,
        },
        {
          kind: 'maxProcessedRows',
          relation: 'referral_program_link_validation_rule_sets',
          max: (PAGE_SIZE + 1) * PROGRAM_VALIDATION_HYDRATION_LIMIT,
        },
        { kind: 'maxBitmapIndexRows', max: PAGE_SIZE + 1 },
      ],
      seededRows: {
        referral_program_topic_link_validation_rule_sets: VALIDATION_COUNT + FANOUT,
        referral_program_link_validation_rule_sets: VALIDATION_COUNT,
      },
    })
    // no-mistakes-disable-next-line query-reached-per-item: three fixed pagination cases capture separate plans.
    await runAndCapture(
      scenario.id,
      async () => {
        const page = await listReferralLinkValidationsForProgram(scenario.program, {
          limit: PAGE_SIZE,
          after: 'after' in scenario ? scenario.after : undefined,
        })
        assert.equal(page.results.length, 'empty' in scenario ? 0 : PAGE_SIZE)
        assert.equal(page.page_info.has_next_page, !('empty' in scenario))
      },
      undefined,
      'listReferralLinkValidationsForProgram',
    )
  }
  await captureReferralValidationKeyed({
    programId,
    hitId: validationId(VALIDATION_COUNT - TARGET_STRIDE),
    hitSlug: validationSlug(VALIDATION_COUNT - TARGET_STRIDE),
    foreignSlug: validationSlug(1),
    foreignId: validationId(1),
    missingId: seedUuid(999_999, 'ca'),
    seededBindings: VALIDATION_COUNT + FANOUT,
    seededValidations: VALIDATION_COUNT,
  })
}
