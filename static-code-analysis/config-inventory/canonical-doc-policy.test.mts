import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'

import { checkConfigInventoryPolicy } from './index.mts'
import { makeRepoFixture } from './test-helpers/repo-fixture.mts'

const ENV_VARS_DOC = 'docs/overview/infrastructure/environment-variables.md'
const COMMAND_CATALOG_DOC = 'dev/reference-command-catalog.md'
const canonicalDocs: Record<string, string> = {
  [ENV_VARS_DOC]: './dev/config-inventory\n',
  'docs/overview/architecture/dynamic-config.md': './dev/config-inventory\n',
  'docs/development/local-env-vars.md': './dev/config-inventory\n',
  'dev/README.md': '[Command Catalog](reference-command-catalog.md)\n',
  [COMMAND_CATALOG_DOC]: './dev/config-inventory\n',
  'static-code-analysis/README.md': './dev/config-inventory\n',
}

describe('config inventory canonical documentation policy', () => {
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeCanonicalFixture(files = canonicalDocs) {
    const fixture = await makeRepoFixture({
      ...files,
      'pnpm-workspace.yaml': 'minimumReleaseAge: 2880\n',
    })
    testDirs.push(fixture.dir)
    return fixture.ctx
  }

  it('requires the command catalog to document config inventory and the dev index to route there', async () => {
    const ctx = await makeCanonicalFixture({
      ...canonicalDocs,
      'dev/README.md': 'no route\n',
      [COMMAND_CATALOG_DOC]: 'no command\n',
    })

    await expect(checkConfigInventoryPolicy(ctx)).resolves.toEqual({
      errors: expect.arrayContaining([
        'dev/reference-command-catalog.md must mention ./dev/config-inventory',
        'dev/README.md must link to dev/reference-command-catalog.md',
      ]),
    })
  })

  it('reports a missing command catalog without rejecting the policy check', async () => {
    const { [COMMAND_CATALOG_DOC]: _missingCatalog, ...files } = canonicalDocs
    const ctx = await makeCanonicalFixture(files)

    await expect(checkConfigInventoryPolicy(ctx)).resolves.toEqual({
      errors: expect.arrayContaining([
        'dev/reference-command-catalog.md is untracked; config inventory docs cannot be cross-linked',
        'dev/reference-command-catalog.md is missing or unreadable; config inventory docs cannot be cross-linked',
      ]),
    })
  })

  it('requires every canonical config-inventory document to be tracked and readable', async () => {
    for (const missingDoc of Object.keys(canonicalDocs)) {
      const files = { ...canonicalDocs }
      delete files[missingDoc]
      const errors = (await checkConfigInventoryPolicy(await makeCanonicalFixture(files))).errors

      expect(errors).toEqual(
        expect.arrayContaining([
          `${missingDoc} is untracked; config inventory docs cannot be cross-linked`,
          `${missingDoc} is missing or unreadable; config inventory docs cannot be cross-linked`,
        ]),
      )
    }
  })

  it('does not let readable untracked config-inventory documentation satisfy the guard', async () => {
    const ctx = await makeCanonicalFixture()
    const trackedFiles = ctx.trackedFiles.filter(file => file !== COMMAND_CATALOG_DOC)

    await expect(
      checkConfigInventoryPolicy({ ...ctx, trackedFiles, trackedFileSet: new Set(trackedFiles) }),
    ).resolves.toEqual({
      errors: expect.arrayContaining([
        `${COMMAND_CATALOG_DOC} is untracked; config inventory docs cannot be cross-linked`,
      ]),
    })
  })

  it('reports non-text and throwing config-inventory documentation readers deterministically', async () => {
    const ctx = await makeCanonicalFixture()

    await expect(
      checkConfigInventoryPolicy(ctx, { readCanonicalDoc: async () => false }),
    ).resolves.toEqual({
      errors: expect.arrayContaining([
        expect.stringContaining('returned boolean; config inventory docs must be readable text'),
      ]),
    })
    await expect(
      checkConfigInventoryPolicy(ctx, {
        readCanonicalDoc: async () => {
          throw new Error('fixture read failure')
        },
      }),
    ).resolves.toEqual({
      errors: expect.arrayContaining([
        expect.stringContaining(
          'is missing or unreadable; config inventory docs cannot be cross-linked',
        ),
      ]),
    })
  })
})
