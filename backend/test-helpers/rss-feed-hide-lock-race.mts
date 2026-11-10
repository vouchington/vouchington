import { beginTransaction, type OwnedTransaction, type TransactionQuery } from '@data-stores/psql'

/** Runs the hide after the caller's open owner transaction commits. */
export async function runTestRssFeedHideLockRace(input: {
  owner: OwnedTransaction
  hide: (query: TransactionQuery) => Promise<void>
}): Promise<void> {
  await input.owner.commit()
  await using hider = await beginTransaction()
  await input.hide(hider)
  await hider.commit()
}
