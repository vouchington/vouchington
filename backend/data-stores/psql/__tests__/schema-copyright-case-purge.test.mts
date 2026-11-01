import { describe, expect, it } from 'vitest'
import { COPYRIGHT_CASE_PURGE_PHASES } from '../../../services/copyright-notices/retention-case-purge-order.mts'
import { COPYRIGHT_CASE_POINTER_CUTS } from '../../../services/copyright-notices/retention-case-purge-pointers.mts'
import {
  COPYRIGHT_CASE_FINAL_POINTER_CUT,
  COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER,
} from '../../../services/copyright-notices/retention-case-purge-final.mts'
import { COPYRIGHT_CASE_RESIDUAL_DELETE_ORDER } from '../../../services/copyright-notices/retention-case-purge-residual.mts'
import { COPYRIGHT_CASE_EMAIL_LINK_DELETE_TABLE } from '../../../services/copyright-notices/retention-case-purge-email-links.mts'
import {
  hasPurgeCursorIndex,
  reachablePurgeTables,
  readCopyrightCasePurgeSchema,
} from '../../../test-helpers/data-stores/psql/copyright-case-purge-schema.mts'

describe('copyright case purge schema closure', () => {
  it('pages every owned RESTRICT child before its parent through an indexed FK path', async () => {
    const {
      foreignKeys,
      indexes,
      columns: tableColumns,
      columnTypes,
      enumValues,
    } = await readCopyrightCasePurgeSchema()
    const phases = COPYRIGHT_CASE_PURGE_PHASES
    const pathFailures: string[] = []
    for (const [table, path] of phases) {
      if (path.at(-1)?.[0] !== table)
        pathFailures.push(`${table}: final path edge names a different table`)
      let parent = 'copyright_notices'
      let available = ['id'] as readonly string[]
      for (const [
        child,
        columns,
        parentColumns,
        keyColumns,
        selectedColumns,
        cursorColumns,
      ] of path) {
        for (const column of parentColumns) {
          if (!tableColumns[parent]?.includes(column) || !available.includes(column))
            pathFailures.push(`${child}: parent path cannot supply ${parent}.${column}`)
        }
        for (const column of [...columns, ...keyColumns, ...selectedColumns, ...cursorColumns]) {
          if (!tableColumns[child]?.includes(column))
            pathFailures.push(`${child}: path uses missing ${column}`)
        }
        if (parentColumns.length !== columns.length)
          pathFailures.push(`${child}: path join columns differ in length`)
        if (!hasPurgeCursorIndex(indexes, child, columns, cursorColumns))
          pathFailures.push(
            `${child}: no FK-scoped cursor index for ${columns.join(',')} / ${cursorColumns.join(',')}`,
          )
        parent = child
        available = selectedColumns
      }
    }
    expect.soft(pathFailures).toEqual([])

    const order = [
      ...phases.map(phase => phase[0]),
      COPYRIGHT_CASE_EMAIL_LINK_DELETE_TABLE,
      ...COPYRIGHT_CASE_FINAL_TAIL_DELETE_ORDER,
      ...COPYRIGHT_CASE_RESIDUAL_DELETE_ORDER,
    ]
    const firstDelete = new Map<string, number>()
    order.forEach((table, index) => {
      if (!firstDelete.has(table)) firstDelete.set(table, index)
    })
    const owned = reachablePurgeTables(foreignKeys, [
      ...order,
      ...phases.flatMap(phase => phase[1].map(edge => edge[0])),
    ])
    const pointerCuts: ReadonlyArray<readonly [string, readonly string[]]> = [
      ...COPYRIGHT_CASE_POINTER_CUTS,
      ['copyright_notices', COPYRIGHT_CASE_FINAL_POINTER_CUT],
    ]
    const failures: string[] = []
    for (const table of owned) {
      if (!firstDelete.has(table)) failures.push(`${table}: RESTRICT descendant has no purge phase`)
    }
    for (const fk of foreignKeys) {
      if (fk.onDelete !== 'restrict' && fk.onDelete !== 'no action') continue
      if (!owned.has(fk.parent) || !owned.has(fk.child)) continue
      const childOrder = firstDelete.get(fk.child)
      const parentOrder = firstDelete.get(fk.parent)
      if (childOrder === undefined || parentOrder === undefined) continue
      if (childOrder < parentOrder) continue
      const cut = pointerCuts.some(
        ([table, columns]) =>
          table === fk.child && fk.columns.some(column => columns.includes(column)),
      )
      if (!cut)
        failures.push(`${fk.name}: ${fk.child} is deleted after ${fk.parent} without a pointer cut`)
    }
    expect.soft(failures).toEqual([])

    const uniqueScope = (table: string, keys: string[], predicateWords: string[] = []) =>
      indexes.some(
        index =>
          index.table === table &&
          index.unique &&
          index.keys.join(',') === keys.join(',') &&
          (predicateWords.length > 0 || index.predicate === null) &&
          predicateWords.every(word => index.predicate?.includes(word)),
      )
    const boundedTailFailures: string[] = []
    if (
      !uniqueScope(
        'copyright_notice_email_intake_notice_links',
        ['copyright_notice_id'],
        ['link_kind', 'initial'],
      )
    )
      boundedTailFailures.push('initial email link needs unique case scope')
    if (!uniqueScope('copyright_notice_form_intakes', ['copyright_notice_id']))
      boundedTailFailures.push('form intake needs unique case scope')
    if (
      !uniqueScope(
        'copyright_notice_submissions',
        ['copyright_notice_id'],
        ['kind', 'notice', 'source_kind', 'staff'],
      )
    )
      boundedTailFailures.push('initial nonstaff submission needs unique case scope')
    if (
      !uniqueScope('copyright_territorial_notice_receipts', ['copyright_notice_id', 'jurisdiction'])
    )
      boundedTailFailures.push('territorial receipt needs unique case and jurisdiction scope')
    const jurisdictionType = columnTypes.copyright_territorial_notice_receipts?.jurisdiction
    if (!jurisdictionType || !enumValues[jurisdictionType]?.length)
      boundedTailFailures.push('territorial receipt jurisdiction needs a finite enum')
    const currentDecisionPath = phases.find(
      phase => phase[0] === 'copyright_territorial_decision_identities',
    )
    if (!currentDecisionPath?.[2]?.includes('current_territorial_decision_identity_id'))
      boundedTailFailures.push('paged decision identity phase must leave only the current pointer')
    expect(boundedTailFailures).toEqual([])
  })
})
