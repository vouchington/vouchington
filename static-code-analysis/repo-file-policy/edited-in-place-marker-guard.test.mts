import { describe, expect, it } from 'vitest'

import {
  LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS,
  PRE_LAUNCH_IN_PLACE_EDITS,
} from './postgres-schema-guardrail-allowlist.mts'
import { setupRepoFilePolicyTest } from './repo-file-policy-test-helpers.mts'

describe('edited-in-place marker guard', () => {
  const { makeRepo, run, track } = setupRepoFilePolicyTest()

  it('accepts the current edited-in-place marker wording on a migration file', async () => {
    const dir = await makeRepo()
    await track(
      dir,
      'backend/data-stores/psql/migrations/0999-edited-in-place-current.sql',
      [
        '-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)',
        'CREATE TABLE IF NOT EXISTS zz_test_marker_current (id integer PRIMARY KEY);',
      ].join('\n'),
    )

    await expect(run(dir)).resolves.toEqual({ stdout: 'All checks passed.' })
  })

  it('rejects the retired edited-in-place marker wording on a migration file not in the legacy allowlist', async () => {
    const dir = await makeRepo()
    const file = 'backend/data-stores/psql/migrations/0999-edited-in-place-retired.sql'
    await track(
      dir,
      file,
      [
        '-- edited-in-place: pre-launch, never deployed to production',
        'CREATE TABLE IF NOT EXISTS zz_test_marker_retired (id integer PRIMARY KEY);',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `file=${file},line=1::edited-in-place marker uses the retired wording`,
      ),
    })
  })

  it('rejects an edited-in-place marker whose wording matches neither the current nor the retired text', async () => {
    const dir = await makeRepo()
    const file = 'backend/data-stores/psql/migrations/0999-edited-in-place-mangled.sql'
    await track(
      dir,
      file,
      [
        '-- edited-in-place: pre-launch, not deployed yet somewhere',
        'CREATE TABLE IF NOT EXISTS zz_test_marker_mangled (id integer PRIMARY KEY);',
      ].join('\n'),
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `file=${file},line=1::edited-in-place marker must read exactly`,
      ),
    })
  })

  it('accepts the retired edited-in-place marker wording only for a file listed in the legacy allowlist', async () => {
    const dir = await makeRepo()
    const file = 'backend/data-stores/psql/migrations/0999-edited-in-place-legacy-listed.sql'
    LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS.add(file)
    try {
      await track(
        dir,
        file,
        [
          '-- edited-in-place: pre-launch, never deployed to production',
          'CREATE TABLE IF NOT EXISTS zz_test_marker_legacy_listed (id integer PRIMARY KEY);',
        ].join('\n'),
      )

      // The allowlist file itself is intentionally left untracked here so the stale-entry sweep
      // (which walks every real LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS entry, not just this
      // test's synthetic one) does not fire for the ~60 real entries this ephemeral repo never
      // tracks; that sweep is covered separately below.
      await expect(run(dir)).resolves.toEqual({ stdout: 'All checks passed.' })
    } finally {
      LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS.delete(file)
    }
  })

  it('reports a stale legacy edited-in-place marker allowlist entry once the file moves off the retired wording', async () => {
    const dir = await makeRepo()
    const file = 'backend/data-stores/psql/migrations/0999-edited-in-place-stale-entry.sql'
    LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS.add(file)
    try {
      await track(
        dir,
        file,
        [
          '-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)',
          'CREATE TABLE IF NOT EXISTS zz_test_marker_stale (id integer PRIMARY KEY);',
        ].join('\n'),
      )
      await track(
        dir,
        'static-code-analysis/repo-file-policy/postgres-schema-guardrail-allowlist.mts',
        '',
      )

      await expect(run(dir)).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining(
          `stale legacy edited-in-place marker allowlist entry: ${file}`,
        ),
      })
    } finally {
      LEGACY_EDITED_IN_PLACE_MARKER_MIGRATIONS.delete(file)
    }
  })

  it('rejects even the current marker wording once PRE_LAUNCH_IN_PLACE_EDITS.permitted is flipped to false at launch close-out', async () => {
    const dir = await makeRepo()
    const file = 'backend/data-stores/psql/migrations/0999-edited-in-place-post-launch.sql'
    await track(
      dir,
      file,
      [
        '-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)',
        'CREATE TABLE IF NOT EXISTS zz_test_marker_post_launch (id integer PRIMARY KEY);',
      ].join('\n'),
    )

    PRE_LAUNCH_IN_PLACE_EDITS.permitted = false
    try {
      await expect(run(dir)).rejects.toMatchObject({
        code: 1,
        stdout: expect.stringContaining(
          `file=${file},line=1::the pre-launch in-place-edit convention has been retired`,
        ),
      })
    } finally {
      PRE_LAUNCH_IN_PLACE_EDITS.permitted = true
    }
  })
})
