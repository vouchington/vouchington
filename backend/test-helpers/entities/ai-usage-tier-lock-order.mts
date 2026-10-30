import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

/** Submit an ordinary same-tier write while a backdated writer owns the tier row. */
export async function runAiUsageTierOrderRace(
  writeBackdated: (query: TransactionQuery) => Promise<void>,
  writeOrdinary: (query: TransactionQuery) => Promise<void>,
): Promise<void> {
  const tierLocked = Promise.withResolvers<void>()
  const releaseBackdated = Promise.withResolvers<void>()
  const ordinarySubmitted = Promise.withResolvers<void>()
  await using backdated = await beginTransaction()
  const observedBackdated = new Proxy(backdated, {
    apply(target, thisArg, args: Parameters<TransactionQuery>) {
      const input = args[0]
      const statement = typeof input === 'string' ? input : input.text
      const result = Reflect.apply(target, thisArg, args) as Promise<unknown>
      if (!statement.includes('/* registerAiUsageTier */')) return result
      return result.then(async value => {
        tierLocked.resolve()
        await releaseBackdated.promise
        return value
      })
    },
  })
  const backdatedWrite = writeBackdated(observedBackdated)
  void backdatedWrite.catch(tierLocked.reject)
  let ordinaryWrite: Promise<void> | undefined
  try {
    await tierLocked.promise
    await using ordinary = await beginTransaction()
    const observedOrdinary = new Proxy(ordinary, {
      apply(target, thisArg, args: Parameters<TransactionQuery>) {
        const input = args[0]
        const statement = typeof input === 'string' ? input : input.text
        if (!statement.includes('/* registerAiUsageTier */')) {
          ordinarySubmitted.reject(
            new Error('Ordinary AI write reached the ledger before tier registration'),
          )
        } else {
          ordinarySubmitted.resolve()
        }
        return Reflect.apply(target, thisArg, args)
      },
    })
    ordinaryWrite = writeOrdinary(observedOrdinary)
    void ordinaryWrite.catch(ordinarySubmitted.reject)
    await ordinarySubmitted.promise
    releaseBackdated.resolve()
    await backdatedWrite
    await backdated.commit()
    await ordinaryWrite
    await ordinary.commit()
  } finally {
    releaseBackdated.resolve()
    await Promise.allSettled([backdatedWrite, ordinaryWrite])
  }
}
