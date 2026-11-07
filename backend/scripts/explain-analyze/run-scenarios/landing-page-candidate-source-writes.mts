import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { reorderProfileLinks } from '@services/my/profile-links-reorder'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  LANDING_PAGE_REVIEW_COUNT,
  LANDING_PAGE_REVIEW_OWNER_ID,
  landingPageReviewId,
} from '../seed-data/landing-page-candidates.mts'

const PROFILE_ID = seedUuid(0, 'd8')
const REFERRAL_ID = seedUuid(0, 'd9')
const REVIEW_ID = landingPageReviewId(0)

/** Capture source writes; canonical triggers maintain the existing 10k-row candidate relation. */
export async function runLandingPageCandidateSourceWriteScenarios(): Promise<void> {
  await seedSourceWrites()
  try {
    registerScenarioContract('landing-page-candidate-source-profile-reorder', {
      expectations: [
        // The production statement finds, validates, and updates its one profile row.
        { kind: 'maxProcessedRows', relation: 'user_profile_links', max: 3 },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_sync_user_landing_page_candidate_profile_link',
          max: 1,
        },
      ],
      seededRows: { user_landing_page_candidates: LANDING_PAGE_REVIEW_COUNT },
    })
    await runAndCapture(
      'landing-page-candidate-source-profile-reorder',
      () => reorderProfileLinks(LANDING_PAGE_REVIEW_OWNER_ID, [PROFILE_ID]),
      undefined,
      'reorderProfileLinks',
      { afterCapture: restoreProfileOrder, exactCapturedNames: ['reorderProfileLinks'] },
    )

    registerScenarioContract('landing-page-candidate-source-review-owner-update', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'posts', max: 1 },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_sync_user_landing_page_candidate_review_post',
          max: 1,
        },
      ],
      seededRows: { user_landing_page_candidates: LANDING_PAGE_REVIEW_COUNT },
      allowEmptyResult: true,
      crossPartition: {
        posts: 'The source update selects its exact review id across post partitions.',
      },
    })
    await runAndCapture(
      'landing-page-candidate-source-review-owner-update',
      () =>
        write(sql`/* updateLandingCandidateReviewOwner */
        UPDATE posts SET created_by_id = ${seedUser.id} WHERE id = ${REVIEW_ID}`),
      undefined,
      'updateLandingCandidateReviewOwner',
      {
        afterCapture: restoreReviewOwner,
        exactCapturedNames: ['updateLandingCandidateReviewOwner'],
      },
    )

    registerScenarioContract('landing-page-candidate-source-referral-owner-update', {
      expectations: [
        { kind: 'maxProcessedRows', relation: 'user_referral_program_links', max: 1 },
        {
          kind: 'maxFunctionCalls',
          function: 'fn_sync_user_landing_page_candidate_referral_link',
          max: 1,
        },
      ],
      seededRows: { user_landing_page_candidates: LANDING_PAGE_REVIEW_COUNT },
      allowEmptyResult: true,
    })
    await runAndCapture(
      'landing-page-candidate-source-referral-owner-update',
      () =>
        write(sql`/* updateLandingCandidateReferralOwner */
        UPDATE user_referral_program_links SET user_id = ${seedUser.id} WHERE id = ${REFERRAL_ID}`),
      undefined,
      'updateLandingCandidateReferralOwner',
      {
        afterCapture: restoreReferralOwner,
        exactCapturedNames: ['updateLandingCandidateReferralOwner'],
      },
    )
  } finally {
    await restoreReviewOwner()
    await write(
      sql`/* deleteLandingCandidateWriteProfile */ DELETE FROM user_profile_links WHERE id = ${PROFILE_ID}`,
    )
    await write(
      sql`/* deleteLandingCandidateWriteReferral */ DELETE FROM user_referral_program_links WHERE id = ${REFERRAL_ID}`,
    )
  }
}

async function seedSourceWrites(): Promise<void> {
  await using query = await beginTransaction()
  await query(sql`/* seedLandingCandidateWriteProfile */
    INSERT INTO user_profile_links (id, user_id, link_type, sort_order, name)
    VALUES (${PROFILE_ID}, ${LANDING_PAGE_REVIEW_OWNER_ID}, 'url', 7, 'Explain candidate maintenance')`)
  await query(sql`/* seedLandingCandidateWriteReferral */
    INSERT INTO user_referral_program_links (id, user_id, referral_program_topic_id, url_id, created_via)
    VALUES (${REFERRAL_ID}, ${LANDING_PAGE_REVIEW_OWNER_ID}, ${seedUuid(0, '09')}, ${seedUuid(0, '03')}, 'system')`)
  await query.commit()
}

async function restoreProfileOrder(): Promise<void> {
  await write(sql`/* restoreLandingCandidateProfileOrder */
    UPDATE user_profile_links SET sort_order = 7 WHERE id = ${PROFILE_ID}`)
}

async function restoreReviewOwner(): Promise<void> {
  await write(sql`/* restoreLandingCandidateReviewOwner */
    UPDATE posts SET created_by_id = ${LANDING_PAGE_REVIEW_OWNER_ID} WHERE id = ${REVIEW_ID}`)
}

async function restoreReferralOwner(): Promise<void> {
  await write(sql`/* restoreLandingCandidateReferralOwner */
    UPDATE user_referral_program_links SET user_id = ${LANDING_PAGE_REVIEW_OWNER_ID} WHERE id = ${REFERRAL_ID}`)
}
