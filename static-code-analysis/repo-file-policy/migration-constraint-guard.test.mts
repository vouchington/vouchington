import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from './repo-file-policy-test-helpers.mts'

describe('migration constraint guard', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('accepts paired NOT VALID and VALIDATE CONSTRAINT statements', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/0999-valid-constraint.sql',
      [
        'ALTER TABLE children ADD CONSTRAINT fk_children_parent -- fk-index-guard-allow: unrelated fixture, not testing FK indexing',
        '  FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE NOT VALID;',
        'ALTER TABLE children VALIDATE CONSTRAINT fk_children_parent;',
      ].join('\n'),
    )
    await expect(run(dir)).resolves.toEqual({ stdout: 'All checks passed.' })
  })

  it('rejects new stored polymorphic target pairs', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/0999-polymorphic.sql',
      'CREATE TABLE targets (entity_type text NOT NULL, entity_id uuid NOT NULL);\n',
    )
    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('polymorphic entity_type/entity_id targets'),
    })
  })
})
