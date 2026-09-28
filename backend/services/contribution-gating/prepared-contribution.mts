import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'

export type PreparedContribution<Response> = {
  response: Response
  finalize: () => Promise<Response | void>
}

const finalizationFailures = new WeakMap<object, unknown[]>()

export async function executePreparedContribution<Response>(
  query: TransactionQuery,
  prepare: () => Promise<PreparedContribution<Response>>,
): Promise<Response> {
  const prepared = await prepare()
  registerPostCommitAction(query, async () => {
    try {
      const finalizedResponse = await prepared.finalize()
      if (finalizedResponse === undefined) return
      replacePreparedResponse(prepared.response, finalizedResponse)
    } catch (error) {
      const failures = finalizationFailures.get(query) ?? []
      failures.push(error)
      finalizationFailures.set(query, failures)
      throw error
    }
  })
  return prepared.response
}

/** The transaction runner logs and swallows post-commit failures. Callers still need the error. */
export function rejectFailedPreparedContribution(query: object): void {
  const failures = finalizationFailures.get(query)
  finalizationFailures.delete(query)
  const error = failures?.[0]
  if (error === undefined) return
  if (error instanceof Error) throw error
  throw new Error(String(error))
}

function replacePreparedResponse<Response>(response: Response, finalizedResponse: Response): void {
  if (typeof response !== 'object' || response === null)
    throw new Error(
      'Prepared contribution responses that finalize to a replacement must be objects',
    )
  if (typeof finalizedResponse !== 'object' || finalizedResponse === null)
    throw new Error('Prepared contribution finalization results must be objects')
  Object.assign(response, finalizedResponse)
}
