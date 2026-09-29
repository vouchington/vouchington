import { describe, expect, it } from 'vitest'
import {
  readTestRetainedIdentityForeignKeys,
  type RetainedIdentityForeignKey,
} from '@voucha/test-helpers/entities/retained-identity-foreign-keys'
import { ROOT_FAMILIES } from '../cleanup-retained-identities.mts'

type Registry = Record<string, { table: string; references: readonly (readonly string[])[] }>

/** Root cleanup deletes a root only when every registered reference is absent. */
function unregisteredRetainedForeignKeys(
  foreignKeys: readonly RetainedIdentityForeignKey[],
  registry: Registry,
): string[] {
  const registered = new Map(
    Object.values(registry).map(family => [
      family.table,
      new Set(family.references.map(([table, column]) => `${table}.${column}`)),
    ]),
  )
  return foreignKeys
    .filter(({ target, owner, column }) => !registered.get(target)?.has(`${owner}.${column}`))
    .map(({ target, owner, column }) => `${owner}.${column} -> ${target}`)
}

describe('retained identity root registry', () => {
  it('lists every foreign key that targets a retained identity root', async () => {
    const foreignKeys = await readTestRetainedIdentityForeignKeys()
    expect(foreignKeys.length).toBeGreaterThan(0)
    expect(foreignKeys).toContainEqual({
      target: 'retained_user_identities',
      owner: 'post_clearance_changes',
      column: 'changed_by_id',
    })
    expect(unregisteredRetainedForeignKeys(foreignKeys, ROOT_FAMILIES)).toEqual([])
  })

  it('reports a foreign key that root cleanup does not know about', () => {
    const stray = { target: 'retained_user_identities', owner: 'new_audit_rows', column: 'user_id' }
    expect(unregisteredRetainedForeignKeys([stray], ROOT_FAMILIES)).toEqual([
      'new_audit_rows.user_id -> retained_user_identities',
    ])
    const unknownRoot = { target: 'retained_widget_identities', owner: 'widgets', column: 'id' }
    expect(unregisteredRetainedForeignKeys([unknownRoot], ROOT_FAMILIES)).toEqual([
      'widgets.id -> retained_widget_identities',
    ])
  })

  it('fails when a registered reference is dropped from its family', async () => {
    const foreignKeys = await readTestRetainedIdentityForeignKeys()
    const { references, ...user } = ROOT_FAMILIES.user
    const withoutClearance = {
      ...ROOT_FAMILIES,
      user: {
        ...user,
        references: references.filter(([table]) => table !== 'post_clearance_changes'),
      },
    }
    expect(unregisteredRetainedForeignKeys(foreignKeys, withoutClearance)).toEqual([
      'post_clearance_changes.changed_by_id -> retained_user_identities',
    ])
  })
})
