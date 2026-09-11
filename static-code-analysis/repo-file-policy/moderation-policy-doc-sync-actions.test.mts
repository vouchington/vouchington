import { describe, expect, it } from 'vitest'

import { extractActionsModerationAssertions } from './moderation-policy-doc-sync-actions-extractors.mts'
import {
  extractFirstColumnTokens,
  extractTableRowCells,
} from './moderation-policy-doc-sync-markdown.mts'
import { setupRepoFilePolicyTest } from './repo-file-policy-test-helpers.mts'

const ACTIONS = 'docs/requirements/navigation/ACTIONS.md'
const ACTIONS_CHILD = 'docs/requirements/navigation/reference-actions-action-buttons-by-entity.md'
const ACTIONS_CANONICAL_INDEX = [
  '# Action Buttons',
  '',
  '## Contents',
  '',
  '- <a id="action-buttons-by-entity"></a>[Action Buttons by Entity](reference-actions-action-buttons-by-entity.md)',
  '',
].join('\n')

function reportSection(
  entities = '`rss_feed_item`, `post`, `comment`, `user`, and `url_hostname`',
  reasons = '`spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`',
) {
  return [
    '### Report',
    `The Report action is available on ${entities}.`,
    '| Action | Surface |',
    '| --- | --- |',
    '| Report (rss_feed_item) | Feed item |',
    '| Report (post) | Post |',
    '| Report (comment) | Comment |',
    '| Report (user) | User |',
    '| Report (url_hostname) | Domain |',
    '',
    `Clicking any Report trigger opens ReportDialog with a reason radio group (${reasons}). vote_manipulation is valid only for post reports.`,
  ].join('\n')
}

describe('moderation ACTIONS canonical child provenance', () => {
  const { makeRepo, run, track, trackSyncedModerationDocs } = setupRepoFilePolicyTest()

  it('attributes a stale report table row to its canonical ACTIONS child line', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir)
    await track(dir, ACTIONS, ACTIONS_CANONICAL_INDEX)
    await track(dir, ACTIONS_CHILD, `${reportSection()}\n| Report (old_entity) | Old |\n`)

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS_CHILD},line=12::${ACTIONS_CHILD}: stale ACTIONS report table entity type old_entity is documented`,
      ),
    })
  })

  it('keeps parent-owned ACTIONS diagnostics on the parent source line', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir)
    await track(
      dir,
      ACTIONS,
      `# Action Buttons\n\n${reportSection('`rss_feed_item`, `post`, `comment`, and `user`')}\n`,
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS},line=4::${ACTIONS}: moderation report entity type url_hostname is missing from report docs`,
      ),
    })
  })

  it('attributes stale Report paragraph entities to the canonical child sentence', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir)
    await track(dir, ACTIONS, ACTIONS_CANONICAL_INDEX)
    await track(
      dir,
      ACTIONS_CHILD,
      `${reportSection('`rss_feed_item`, `post`, `comment`, `user`, `url_hostname`, and `old_entity`')}\n`,
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS_CHILD},line=2::${ACTIONS_CHILD}: stale moderation report entity type old_entity is documented`,
      ),
    })
  })

  it('attributes missing Report table entities to the canonical child table', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir)
    await track(dir, ACTIONS, ACTIONS_CANONICAL_INDEX)
    await track(
      dir,
      ACTIONS_CHILD,
      `${reportSection().replace('| Report (url_hostname) | Domain |\n', '')}\n`,
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS_CHILD},line=5::${ACTIONS_CHILD}: ACTIONS report table entity type url_hostname is missing from report docs`,
      ),
    })
  })

  it('attributes stale Report reasons to the canonical child sentence', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir)
    await track(dir, ACTIONS, ACTIONS_CANONICAL_INDEX)
    await track(
      dir,
      ACTIONS_CHILD,
      `${reportSection(
        undefined,
        '`spam`, `harassment`, `misinformation`, `illegal_content`, `vote_manipulation`, `other`, `old_reason`',
      ).replace('\n\nClicking', '\nClicking')}\n`,
    )

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS_CHILD},line=10::${ACTIONS_CHILD}: stale moderation report reason old_reason is documented`,
      ),
    })
  })

  it('uses the Report heading in a canonical child as the missing-token fallback', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir)
    await track(dir, ACTIONS, ACTIONS_CANONICAL_INDEX)
    await track(dir, ACTIONS_CHILD, '### Report\n')

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS_CHILD},line=1::${ACTIONS_CHILD}: moderation report entity type rss_feed_item is missing from report docs`,
      ),
    })
  })

  it('keeps empty ACTIONS input fail-closed as diagnostics', async () => {
    const dir = await makeRepo()
    await trackSyncedModerationDocs(dir, { actions: '' })

    await expect(run(dir)).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining(
        `::error file=${ACTIONS},line=1::${ACTIONS}: moderation report entity type rss_feed_item is missing from report docs`,
      ),
    })
  })

  it('locates vote wording from the pattern match instead of the Report reason line', () => {
    const content = `${reportSection(
      undefined,
      '`spam`, `harassment`, `misinformation`, `illegal_content`, `other`',
    ).replace(
      ' vote_manipulation is valid only for post reports.',
      '\nVote policy: post-only reporting applies to vote_manipulation.',
    )}\n`
    const sourceAtLine = (line: number) => ({ file: ACTIONS_CHILD, line })
    const assertions = extractActionsModerationAssertions(
      {
        content,
        sourceAtLine,
        sourceAtOffset: offset => sourceAtLine(content.slice(0, offset).split('\n').length),
      },
      sourceAtLine(1),
    )

    expect(assertions.reportReasonsSource).toEqual({ file: ACTIONS_CHILD, line: 11 })
    expect(assertions.voteManipulationWordingSource).toEqual({ file: ACTIONS_CHILD, line: 12 })
  })

  it('extracts every GFM table without treating later tables as loose rows', () => {
    const section = [
      '| First | Value |',
      '| --- | --- |',
      '| alpha | one |',
      '',
      '| Second | Value |',
      '| --- | --- |',
      '| **beta** | two |',
    ].join('\n')

    expect(extractTableRowCells(section)).toEqual([
      ['First', 'Value'],
      ['alpha', 'one'],
      ['Second', 'Value'],
      ['beta', 'two'],
    ])
    expect(extractFirstColumnTokens(section)).toEqual(['alpha', 'beta'])
  })
})
