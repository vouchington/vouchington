import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readTableTriggerNames } from '../../../test-helpers/data-stores/psql/failure-injection.mts'
import {
  injectedFailureTriggers,
  installInjectedFailuresForTestDatabase,
} from '../../../test-helpers/injected-failures.mts'
import { withRejectedPostCategoryVotes } from '../../../test-helpers/post-category-vote-failures.mts'
import { withRejectedStaffActionHistory } from '../../../test-helpers/staff-action-history.mts'

// Guards the failure-injection install in vitest.setup.failure-injection.mts. The helpers inject
// failures with control-table rows; a CREATE/DROP TRIGGER here would take table locks that time
// out against the other test files writing to the same shared tables.
const tables = [...new Set(injectedFailureTriggers.map(({ table }) => table))]
const triggerNames = injectedFailureTriggers.map(({ name }) => name)

type Inject = (actorId: string, execute: () => Promise<string[]>) => Promise<string[]>

describe('failure-injection test database objects', () => {
  it('installs the shared-table triggers once and reinstalls without changes', async () => {
    const installed = await readTableTriggerNames(tables)
    expect(installed).toEqual(expect.arrayContaining(triggerNames))

    await installInjectedFailuresForTestDatabase()

    expect(await readTableTriggerNames(tables)).toEqual(installed)
  })

  it.each<[string, Inject]>([
    ['staff action history', withRejectedStaffActionHistory],
    ['post category votes', withRejectedPostCategoryVotes],
  ])('injects %s failures without changing the shared tables triggers', async (_name, inject) => {
    const before = await readTableTriggerNames(tables)

    const during = await inject(randomUUID(), () => readTableTriggerNames(tables))

    expect(during).toEqual(before)
    expect(await readTableTriggerNames(tables)).toEqual(before)
  })
})
