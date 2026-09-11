import { registerPostCommitAction, type TransactionQuery } from '@data-stores/psql'

export type PreparedContribution<Response> = {
  response: Response
  finalize: () => Promise<Response | void>
}

export async function executePreparedContribution<Response>(
  query: TransactionQuery,
  prepare: () => Promise<PreparedContribution<Response>>,
): Promise<Response> {
  const prepared = await prepare()
  registerPostCommitAction(query, async () => {
    const finalizedResponse = await prepared.finalize()
    if (finalizedResponse === undefined) return
    replacePreparedResponse(prepared.response, finalizedResponse)
  })
  return prepared.response
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
