import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { setupRepoFilePolicyTest } from '../repo-file-policy-test-helpers.mts'

describe('repo-file-policy', () => {
  const { makeRepo, run, track, trackPostEnumSurfaces } = setupRepoFilePolicyTest()

  it('rejects missing public post route directories when none are found', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: [],
    })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post route directories mismatch'),
    })
  })

  it('rejects public post routes with only a layout and no page', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['review'],
    })
    await track(dir, 'web/app/(posts)/discussion/[id]/layout.tsx', 'export default {}\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('public post route directories mismatch'),
    })
  })

  it('ignores tracked-but-deleted public post route files', async () => {
    const dir = await makeRepo()
    await trackPostEnumSurfaces(dir, {
      postTypes: ['discussion', 'review', 'comment', 'topic_recommendation'],
      routes: ['discussion', 'review'],
    })
    const staleRoute = 'web/app/(posts)/story/[id]/comment/[commentId]/page.tsx'
    await track(dir, staleRoute, 'export default {}\n')
    await rm(join(dir, staleRoute))

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('allows non-empty SQL/CSS/Rust/JS files', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(dir, 'backend/data-stores/psql/migrations/9999-ok.sql', 'select 1;\n')
    await track(dir, 'web/app/style.css', '.root { color: red; }\n')
    await track(dir, 'native/addon/src/lib.rs', 'pub fn ok() {}\n')
    await track(dir, 'backend/services/posts/ok.ts', 'export const ok = 1\n')
    await track(dir, 'web/utils/ok.js', "export const ok = 'ok'\n")

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it('allows an explicit repo root from outside the repository', { timeout: 10_000 }, async () => {
    const dir = await makeRepo()
    await track(dir, 'backend/services/posts/ok.ts', 'export const ok = 1\n')

    await expect(run(dir)).resolves.toMatchObject({
      stdout: expect.stringContaining('pass'),
    })
  })

  it(
    'ignores tracked files that have been deleted from the worktree',
    { timeout: 10_000 },
    async () => {
      const dir = await makeRepo()
      await track(
        dir,
        'backend/data-stores/psql/migrations/0999-deleted-add-col.sql',
        'ALTER TABLE foo ADD COLUMN bar TEXT;\n',
      )
      await rm(join(dir, 'backend/data-stores/psql/migrations/0999-deleted-add-col.sql'))

      await expect(run(dir)).resolves.toMatchObject({
        stdout: expect.stringContaining('pass'),
      })
    },
  )
})
