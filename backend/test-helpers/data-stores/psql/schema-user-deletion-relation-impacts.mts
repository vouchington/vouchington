import { beginTransaction, type TransactionQuery } from '@data-stores/psql'

const ownerTable = 'retained_relation__user__category__topic'
const targetColumn = 'relation__user__category__topic_id'

async function newUuid(query: TransactionQuery): Promise<string> {
  const { rows } = await query<{ id: string }>('/* newImpactSchemaUuid */ SELECT uuidv7() AS id')
  return rows[0]!.id
}

async function createDeletionFixture(query: TransactionQuery) {
  const subjectId = await newUuid(query)
  const requestId = await newUuid(query)
  await query('/* createImpactSchemaUser */ INSERT INTO users (id) VALUES ($1)', [subjectId])
  await query(
    '/* createImpactSchemaRequest */ INSERT INTO user_deletion_requests (id, user_id) VALUES ($1, $2)',
    [requestId, subjectId],
  )
  return { subjectId, requestId }
}

export async function insertImpactWithMismatchedSubject(): Promise<void> {
  await using query = await beginTransaction()
  const first = await createDeletionFixture(query)
  const otherSubjectId = await newUuid(query)
  const relationId = await newUuid(query)
  await query('/* createImpactSchemaOtherUser */ INSERT INTO users (id) VALUES ($1)', [
    otherSubjectId,
  ])
  await query(
    `/* createImpactSchemaRetainedRelation */ INSERT INTO ${ownerTable} (subject_id, id) VALUES ($1, $2)`,
    [first.subjectId, relationId],
  )
  await query(
    `/* rejectWrongImpactSubject */ INSERT INTO user_deletion_relation_impacts (request_id, subject_id, ${targetColumn}) VALUES ($1, $2, $3)`,
    [first.requestId, otherSubjectId, relationId],
  )
}

export async function insertImpactWithWrongConcreteTable(): Promise<void> {
  await using query = await beginTransaction()
  const fixture = await createDeletionFixture(query)
  const relationId = await newUuid(query)
  await query(
    `/* createWrongTableRetainedRelation */ INSERT INTO ${ownerTable} (subject_id, id) VALUES ($1, $2)`,
    [fixture.subjectId, relationId],
  )
  await query(
    '/* rejectWrongImpactTable */ INSERT INTO user_deletion_relation_impacts (request_id, subject_id, relation__post__category__topic_id) VALUES ($1, $2, $3)',
    [fixture.requestId, fixture.subjectId, relationId],
  )
}

export async function insertCrossRequestImpactPointer(): Promise<void> {
  await using query = await beginTransaction()
  const first = await createDeletionFixture(query)
  const second = await createDeletionFixture(query)
  const relationId = await newUuid(query)
  await query(
    `/* createPointerTargetOwner */ INSERT INTO ${ownerTable} (subject_id, id) VALUES ($1, $2)`,
    [first.subjectId, relationId],
  )
  const { rows } = await query<{ id: string }>(
    `/* createPointerTargetImpact */ INSERT INTO user_deletion_relation_impacts (request_id, subject_id, ${targetColumn}) VALUES ($1, $2, $3) RETURNING id`,
    [first.requestId, first.subjectId, relationId],
  )
  await query(
    "/* rejectCrossRequestImpactPointer */ INSERT INTO user_deletion_external_works (request_id, work_kind, relation_impact_id) VALUES ($1, 'entity-relation-effects', $2)",
    [second.requestId, rows[0]!.id],
  )
}

export async function insertEffectWorkWithoutImpactPointer(): Promise<void> {
  await using query = await beginTransaction()
  const fixture = await createDeletionFixture(query)
  await query(
    "/* rejectMissingEffectPointer */ INSERT INTO user_deletion_external_works (request_id, work_kind) VALUES ($1, 'entity-relation-effects')",
    [fixture.requestId],
  )
}

export async function completeAndPurgeEffectImpact(): Promise<{
  requestId: string
  row:
    | {
        request_id: string
        relation_impact_id: string | null
        work_key: string | null
      }
    | undefined
}> {
  await using query = await beginTransaction()
  const fixture = await createDeletionFixture(query)
  const relationId = await newUuid(query)
  await query(
    `/* createEffectTargetOwner */ INSERT INTO ${ownerTable} (subject_id, id) VALUES ($1, $2)`,
    [fixture.subjectId, relationId],
  )
  const { rows: impacts } = await query<{ id: string }>(
    `/* createEffectTargetImpact */ INSERT INTO user_deletion_relation_impacts (request_id, subject_id, ${targetColumn}, recomputed_at) VALUES ($1, $2, $3, CURRENT_TIMESTAMP) RETURNING id`,
    [fixture.requestId, fixture.subjectId, relationId],
  )
  const { rows: works } = await query<{ id: string }>(
    "/* createEffectPointer */ INSERT INTO user_deletion_external_works (request_id, work_kind, relation_impact_id) VALUES ($1, 'entity-relation-effects', $2) RETURNING id",
    [fixture.requestId, impacts[0]!.id],
  )
  await query(
    '/* completeEffectPointer */ UPDATE user_deletion_external_works SET completed_at = CURRENT_TIMESTAMP WHERE id = $1',
    [works[0]!.id],
  )
  await query(
    '/* purgeCompletedEffectImpact */ DELETE FROM user_deletion_relation_impacts WHERE id = $1',
    [impacts[0]!.id],
  )
  const { rows } = await query<{
    request_id: string
    relation_impact_id: string | null
    work_key: string | null
  }>(
    '/* readCompletedEffectPointer */ SELECT request_id, relation_impact_id, work_key FROM user_deletion_external_works WHERE id = $1',
    [works[0]!.id],
  )
  return { requestId: fixture.requestId, row: rows[0] }
}
