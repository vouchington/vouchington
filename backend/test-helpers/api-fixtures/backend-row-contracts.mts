import assert from 'node:assert/strict'

import ts, { type Program } from 'typescript'
import { getCallRowTypeFacts, getExportedTypeFacts } from 'vouchington-tooling/contract-schema'

const postType = {
  fileName: 'backend/types/entities/post.mts',
  exportName: 'Post',
}

/** Checks the PostgreSQL row projections and defaults in the real backend TypeScript program. */
export function assertBackendRowContracts(program: Program): void {
  function fileName(path: string): string {
    const file = program.getSourceFiles().find(candidate => candidate.fileName.endsWith(path))
    if (!file) throw new Error(`Backend program does not include ${path}`)
    return file.fileName
  }

  const postSelector = { ...postType, fileName: fileName(postType.fileName) }
  const post = getExportedTypeFacts({ program, typescript: ts, ...postSelector })
  assert.equal(post.isAny, false)

  for (const [path, exportName] of [
    ['backend/data-stores/psql/types.mts', 'QueryExecutor'],
    ['backend/data-stores/psql/runtime.mts', 'query'],
    ['backend/data-stores/psql/runtime.mts', 'read'],
    ['backend/data-stores/psql/runtime.mts', 'write'],
  ]) {
    const defaultRow = getExportedTypeFacts({
      program,
      typescript: ts,
      fileName: fileName(path),
      exportName,
      defaultTypeParameterIndex: 0,
      assignableTo: { Post: postSelector },
    })
    assert.equal(defaultRow.isAny, false)
    assert.equal(
      defaultRow.assignableTo.Post,
      false,
      `Default row masquerades as Post: default=${defaultRow.display}; Post=${post.display}`,
    )
  }

  const projectedReads = getCallRowTypeFacts({
    program,
    typescript: ts,
    fileName: fileName('backend/services/posts/public-ids.mts'),
    calleeText: 'read',
    rowSource: 'awaitedRows',
    typeArgumentText: '{ id: string }',
    propertyNames: ['id'],
  })
  assert.equal(projectedReads.length, 1, 'Expected one getPublicPostIds projected read')
  assert.equal(projectedReads[0]?.isAny, false)
  assert.equal(projectedReads[0]?.properties.id, 'string')

  const consumed = {
    id: 'string',
    title: 'string',
    markdown: 'string',
    ai_summary_markdown: 'string',
    broadcast: 'PostBroadcast',
    privacy: 'PostPrivacy',
    is_anonymous: 'boolean',
    structured_data: 'unknown',
    data_point_vertical: 'string | null',
    declared_language: 'string | null',
    deleted_at: 'Date | null',
    archived_at: 'Date | null',
  }
  const absent = [
    'clearance_status',
    'clearance_reason',
    'clearance_updated_at',
    'created_by_id',
    'created_via',
    'llm_moderation_content_sha256',
    'search_vector',
  ]
  for (const { path, expected, omitted } of [
    {
      path: 'backend/services/posts/create/insert-post.mts',
      expected: { ...consumed, root_post_id: 'string | null', community_id: 'string | null' },
      omitted: absent,
    },
    {
      path: 'backend/services/posts/create-story-post.mts',
      expected: consumed,
      omitted: [...absent, 'root_post_id', 'community_id'],
    },
  ]) {
    const writes = getCallRowTypeFacts({
      program,
      typescript: ts,
      fileName: fileName(path),
      calleeText: 'write',
      rowSource: 'typeArgument',
      propertyNames: [...Object.keys(expected), ...omitted],
      assignableTo: { Post: postSelector },
    })
    assert.equal(writes.length, 1, `Expected one write type argument in ${path}`)
    const row = writes[0]!
    assert.equal(row.isAny, false)
    assert.equal(row.assignableTo.Post, false)
    for (const name of omitted) assert.equal(row.properties[name], undefined)
    for (const [name, type] of Object.entries(expected)) {
      assert.deepEqual({ name, type: row.properties[name] }, { name, type })
    }
  }
}
