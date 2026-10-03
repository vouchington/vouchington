import sql, { type SQLStatement } from 'sql-template-strings'

/** Durable provenance, unaffected by ON DELETE SET NULL on moderator identities. */
export function automatedAssessmentSql(assessmentAlias = 'assessment'): SQLStatement {
  return sql``.append(
    `${checkedAlias(assessmentAlias)}.copyright_notice_form_screening_id IS NOT NULL`,
  )
}

function checkedAlias(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error('Invalid copyright SQL alias')
  return alias
}
