import type { SQLStatement } from 'sql-template-strings'

export type CopyrightMinimalBlockerPage = {
  scanned: number
  last_id: string | null
  blocked: boolean
  valid_target: boolean
  unrestricted_target: boolean
  claimant_receipt: boolean
  notice_assessment: boolean
  form_assessment: boolean
}

export type CopyrightMinimalBlockerPhase = {
  table: string
  statement: (noticeId: string, cursor: string | null, pageSize: number) => SQLStatement
}
