import type { FiniteValue } from '@data-stores/psql/finite-values/index'

/** The admitted AI run a client follows to its end; `status` is a code, never display text. */
export type CopyrightAiRun = {
  id: string
  status: FiniteValue<'copyright_notice_ai_run_statuses'>
}

export function toCopyrightAiRun(
  id: string | null,
  status: CopyrightAiRun['status'] | null,
): CopyrightAiRun | null {
  return id && status ? { id, status } : null
}
