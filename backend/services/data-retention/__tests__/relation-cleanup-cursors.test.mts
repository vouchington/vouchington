import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { electedRelationMetadata } from '@services/users/relation-impact-targets'
import { withTestRetainedRelationCleanupReservation } from '../../../test-helpers/entities/retained-relation-cursors.mts'

function retainedRootFamily(subjectType: string): 'user' | 'post' | 'topic' | 'rss_feed_item' {
  if (
    subjectType === 'user' ||
    subjectType === 'post' ||
    subjectType === 'topic' ||
    subjectType === 'rss_feed_item'
  )
    return subjectType
  throw new Error(`Relation cursor test cannot seed ${subjectType} roots`)
}

describe('retained relation cleanup cursors', () => {
  it('ensures all family cursors and reuses them on replay while leaving foreign tuples', async () => {
    await withTestRetainedRelationCleanupReservation(
      async ({
        insertRoot: insertTestRetainedIdentityRoot,
        insertRelation: insertTestRetainedRelationIdentity,
        hasRelation: hasTestRetainedRelationIdentity,
        cleanup: cleanupRetainedRelationIdentities,
        cursorNames: getRetainedRelationCleanupCursors,
        cursorRows: readRetainedRelationCleanupCursors,
      }) => {
        const fixtures: {
          table: string
          ownedSubjectId: string
          ownedRelationId: string
          foreignSubjectId: string
          foreignRelationId: string
        }[] = []
        const roots = new Map<string, { ownedId: string; foreignId: string }>()
        for (const metadata of electedRelationMetadata) {
          const family = retainedRootFamily(metadata.subject_type)
          let root = roots.get(family)
          if (!root) {
            root = { ownedId: v7(), foreignId: v7() }
            roots.set(family, root)
            await insertTestRetainedIdentityRoot(family, root.ownedId)
            await insertTestRetainedIdentityRoot(family, root.foreignId)
          }
          const fixture = {
            table: metadata.table_name,
            ownedSubjectId: root.ownedId,
            ownedRelationId: v7(),
            foreignSubjectId: root.foreignId,
            foreignRelationId: v7(),
          }
          fixtures.push(fixture)
          await insertTestRetainedRelationIdentity(
            fixture.table,
            fixture.ownedSubjectId,
            fixture.ownedRelationId,
          )
          await insertTestRetainedRelationIdentity(
            fixture.table,
            fixture.foreignSubjectId,
            fixture.foreignRelationId,
          )
        }
        const keysByTable = Object.fromEntries(
          fixtures.map(fixture => [
            fixture.table,
            [{ subjectId: fixture.ownedSubjectId, relationId: fixture.ownedRelationId }],
          ]),
        )
        const expectedNames = electedRelationMetadata.map(metadata => metadata.table_name)
        const created = await cleanupRetainedRelationIdentities(1, keysByTable, {
          ensureCursors: true,
        })
        expect(created).toEqual(
          expectedNames.map(relationTable => ({
            relationTable,
            scanned: 1,
            deleted: 1,
            hasMore: false,
          })),
        )
        const cursorNames = await getRetainedRelationCleanupCursors()
        expect(cursorNames.filter(name => expectedNames.includes(name)).toSorted()).toEqual(
          expectedNames.toSorted(),
        )
        for (const fixture of fixtures) {
          expect(
            await hasTestRetainedRelationIdentity(
              fixture.table,
              fixture.ownedSubjectId,
              fixture.ownedRelationId,
            ),
          ).toBe(false)
          expect(
            await hasTestRetainedRelationIdentity(
              fixture.table,
              fixture.foreignSubjectId,
              fixture.foreignRelationId,
            ),
          ).toBe(true)
        }
        const replayed = await cleanupRetainedRelationIdentities(1, keysByTable, {
          ensureCursors: true,
        })
        expect(replayed).toEqual(
          expectedNames.map(relationTable => ({
            relationTable,
            scanned: 0,
            deleted: 0,
            hasMore: false,
          })),
        )
        const replayNames = await getRetainedRelationCleanupCursors()
        expect(replayNames.filter(name => expectedNames.includes(name)).toSorted()).toEqual(
          expectedNames.toSorted(),
        )
        for (const fixture of fixtures) {
          expect(
            await hasTestRetainedRelationIdentity(
              fixture.table,
              fixture.ownedSubjectId,
              fixture.ownedRelationId,
            ),
          ).toBe(false)
          expect(
            await hasTestRetainedRelationIdentity(
              fixture.table,
              fixture.foreignSubjectId,
              fixture.foreignRelationId,
            ),
          ).toBe(true)
        }
        const beforeWorker = await readRetainedRelationCleanupCursors()
        const workerPages = await cleanupRetainedRelationIdentities(1)
        const workerRows = await readRetainedRelationCleanupCursors()
        expect(workerPages.map(page => page.relationTable)).toEqual(expectedNames)
        expect(beforeWorker).toHaveLength(expectedNames.length)
        expect(workerRows).toHaveLength(expectedNames.length)
        const cursorId = expect.any(String)
        for (const page of workerPages) {
          expect(page.scanned).toBeGreaterThanOrEqual(0)
          expect(page.scanned).toBeLessThanOrEqual(1)
          expect(page.deleted).toBeGreaterThanOrEqual(0)
          expect(page.deleted).toBeLessThanOrEqual(page.scanned)
          expect(workerRows.find(row => row.entity_relation === page.relationTable)).toEqual({
            entity_relation: page.relationTable,
            cursor_subject_id: page.hasMore ? cursorId : null,
            cursor_relation_id: page.hasMore ? cursorId : null,
          })
        }
        expect(
          workerRows.every(row => {
            const prior = beforeWorker.find(item => item.entity_relation === row.entity_relation)!
            return (
              row.cursor_subject_id === null ||
              prior.cursor_subject_id === null ||
              `${row.cursor_subject_id}/${row.cursor_relation_id}` >
                `${prior.cursor_subject_id}/${prior.cursor_relation_id}`
            )
          }),
        ).toBe(true)
      },
    )
  })
})
