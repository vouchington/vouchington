import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { onTestFinished } from 'vitest'
import sql from 'sql-template-strings'

export async function runConcurrentTestMembershipProductValidation<T>(
  validate: (query: QueryExecutor) => Promise<T>,
): Promise<T> {
  const firstValidationLocked = Promise.withResolvers<void>()
  const releaseFirstValidation = Promise.withResolvers<void>()
  const firstValidation = holdFirstValidation()
  void firstValidation.catch(firstValidationLocked.reject)
  const validations = [firstValidation]
  onTestFinished(async () => {
    releaseFirstValidation.resolve()
    await Promise.allSettled(validations)
  })

  async function holdFirstValidation(): Promise<T> {
    await using transaction = await beginTransaction()
    const query = transaction
    const result = await validate(query)
    firstValidationLocked.resolve()
    await releaseFirstValidation.promise
    await transaction.commit()
    return result
  }

  await firstValidationLocked.promise
  const secondValidation = runSecondValidation()
  validations.push(secondValidation)

  async function runSecondValidation(): Promise<T> {
    await using transaction = await beginTransaction()
    // A locking regression must fail natively while the first validation still owns its locks.
    await transaction(sql`/* runConcurrentTestMembershipProductValidation: native lock budget */
      SELECT set_config('lock_timeout', '1000ms', true)`)
    const result = await validate(transaction)
    await transaction.commit()
    return result
  }
  try {
    return await secondValidation
  } finally {
    releaseFirstValidation.resolve()
    await Promise.all([firstValidation, secondValidation])
  }
}
