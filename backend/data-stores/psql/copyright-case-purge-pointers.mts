/**
 * FK cycles cut after report and evidence proof, before child-first deletion. Most current-result
 * fields have an append-only history row that survives the cut and is deleted in the child pages:
 * submission assessments live in `copyright_notice_submission_assessments`, staff redress results
 * in `copyright_territorial_redress_decisions`, and recommendations in
 * `copyright_notice_email_intake_recommendations`. Two cuts lose information. On a case a hold
 * keeps, `supersedes_decision_id` is the decision supersession chain being cut: the decision rows
 * survive and order by id and `decided_at`, but the explicit link is gone. And
 * `copyright_notice_guest_capability_id` has no history: the capability row survives, but which
 * capability filed a submission is lost.
 */
export const COPYRIGHT_CASE_POINTER_CUTS = [
  ['copyright_territorial_decisions', ['supersedes_decision_id']],
  [
    'copyright_notice_submissions',
    [
      'copyright_notice_guest_capability_id',
      'current_assessment_identity_id',
      'current_assessment_form_screening_id',
    ],
  ],
  ['copyright_territorial_redress_requests', ['current_staff_decision_identity_id']],
  ['copyright_notice_email_intakes', ['current_recommendation_identity_id']],
] as const
export const COPYRIGHT_CASE_POINTER_PHASE_COUNT = COPYRIGHT_CASE_POINTER_CUTS.length
