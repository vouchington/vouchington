import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  exerciseTransactionSavepointForTest,
  exerciseTransactionSavepointHooksForTest,
} from '@voucha/test-helpers/transaction-savepoint'

describe('recoverable transaction savepoints', () => {
  it('rolls back a partial SQL write after 23505 and permits the caller audit to commit', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const result = await exerciseTransactionSavepointForTest(first.id, second.id, false)
    expect(result.thrownError).toBe(result.originalError)
    expect(result.thrownError).toMatchObject({ code: '23505' })
    expect(result.userMarkdown).toBe(result.initialMarkdown)
    expect(result.auditMarkdown).toBe('outer audit committed')
  })

  it('restores the outer savepoint after an inner failure with the same name', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const result = await exerciseTransactionSavepointForTest(first.id, second.id, true)
    expect(result.innerError).toMatchObject({ code: '23505' })
    expect(result.thrownError).toBe(result.originalError)
    expect(result.thrownError).toMatchObject({ message: 'outer savepoint operation failed' })
    expect(result.userMarkdown).toBe(result.initialMarkdown)
    expect(result.auditMarkdown).toBe('outer audit committed')
  })
  it('discards failed scope hooks and runs successful nested hooks only at outer commit', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    const result = await exerciseTransactionSavepointHooksForTest(first.id, second.id)
    expect(result.beforeCommit).toEqual([])
    expect(result.afterCommit).toEqual(['outer', 'successful scope', 'successful inner'])
  })
})
