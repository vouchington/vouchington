import { write } from '@data-stores/psql'
import { isAutomaticProvisionalWithholdingEnabled } from './config.mts'
import { pendingCopyrightEnforcementSql } from './enforcement-pending-sql.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/**
 * Pages the assessments that still owe a restriction, keyed by the immutable assessment ID that
 * `enforceCopyrightAssessment` takes. An automated assessment is listed only while the
 * `automaticProvisionalWithholding` switch is on.
 */
export async function searchPendingCopyrightEnforcementAssessmentIds(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  const automaticWithholding = await isAutomaticProvisionalWithholdingEnabled()
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright enforcement cursor',
    'searchPendingCopyrightEnforcementAssessmentIds',
    'enforcementAssessment',
    pendingCopyrightEnforcementSql('DISTINCT assessment.id AS id', automaticWithholding),
    statement => write(statement),
  )
}
