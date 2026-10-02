import { write } from '@data-stores/psql'
import { getAutomaticEnforcementSince } from './automatic-withholding-since.mts'
import { pendingCopyrightEnforcementSql } from './enforcement-pending-sql.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/**
 * Pages the assessments that still owe a restriction, keyed by the immutable assessment ID that
 * `enforceCopyrightAssessment` takes. An automated assessment is listed only while the
 * `automaticProvisionalWithholding` switch is on and its gates are set, for a notice received in
 * the current on-period from a claimant who is not suspended.
 */
export async function searchPendingCopyrightEnforcementAssessmentIds(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  const automaticSince = await getAutomaticEnforcementSince()
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright enforcement cursor',
    'searchPendingCopyrightEnforcementAssessmentIds',
    'enforcementAssessment',
    pendingCopyrightEnforcementSql('DISTINCT assessment.id AS id', automaticSince),
    statement => write(statement),
  )
}
