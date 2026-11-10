import { beginTransaction, type OwnedTransaction, type TransactionQuery } from '@data-stores/psql'

/** Runs the hide after the caller's open transactions commit. */
export async function runTestRssFeedHideLockRace(input: {
  owner: OwnedTransaction
  publication: OwnedTransaction
  topicId: string
  feedId: string
  hostnameId: string
  hide: (query: TransactionQuery) => Promise<void>
}): Promise<void> {
  await input.owner.commit()
  await input.publication.commit()
  await using hider = await beginTransaction()
  await input.hide(hider)
  await hider.commit()
}
