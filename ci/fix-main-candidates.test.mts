import { describe, expect, it } from 'vitest'

import { authorizedFixMainCandidates } from './fix-main-candidates.mts'

const repository = 'vouchington/vouchington'
const candidate = {
  kind: 'issue',
  authorized: true,
  number: 1,
  url: `https://github.com/${repository}/issues/1`,
}
const liveIssue = {
  number: 1,
  html_url: candidate.url,
  state: 'open',
  author_association: 'MEMBER',
}

describe('fix-main issue authorization', () => {
  it.each([
    'OWNER',
    'MEMBER',
    'COLLABORATOR',
    'CONTRIBUTOR',
    'FIRST_TIMER',
    'FIRST_TIME_CONTRIBUTOR',
    'NONE',
    undefined,
    'UNKNOWN',
  ])('revalidates %s author association against the exact issue', async author_association => {
    const paths: string[] = []
    const result = await authorizedFixMainCandidates({
      json: JSON.stringify([candidate]),
      repository,
      read: async path => {
        paths.push(path)
        return { ...liveIssue, author_association }
      },
    })
    expect(paths).toEqual([`repos/${repository}/issues/1`])
    expect(result).toEqual(
      ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(author_association ?? '') ? [candidate] : [],
    )
  })

  it.each([
    { user: { login: 'github-actions[bot]', type: 'Bot' }, allowed: true },
    { user: { login: 'other[bot]', type: 'Bot' }, allowed: false },
    { user: { login: 'github-actions[bot]', type: 'User' }, allowed: false },
    { user: { login: 'github-actions[bot]' }, allowed: false },
    { user: { type: 'Bot' }, allowed: false },
    { user: undefined, allowed: false },
    { user: null, allowed: false },
  ])('revalidates the exact automation author %j', async ({ user, allowed }) => {
    const result = await authorizedFixMainCandidates({
      json: JSON.stringify([{ ...candidate, user: { login: 'github-actions[bot]', type: 'Bot' } }]),
      repository,
      read: async () => ({ ...liveIssue, author_association: 'NONE', user }),
    })
    expect(result).toEqual(
      allowed ? [{ ...candidate, user: { login: 'github-actions[bot]', type: 'Bot' } }] : [],
    )
  })

  it.each([
    { number: 2 },
    { html_url: 'https://github.com/other/repo/issues/1' },
    { state: 'closed' },
    { pull_request: {} },
  ])('drops changed issue identity or state %j', async changed => {
    for (const author of [
      { author_association: 'MEMBER' },
      { author_association: 'NONE', user: { login: 'github-actions[bot]', type: 'Bot' } },
    ]) {
      expect(
        await authorizedFixMainCandidates({
          json: JSON.stringify([candidate]),
          repository,
          read: async () => ({ ...liveIssue, ...author, ...changed }),
        }),
      ).toEqual([])
    }
  })

  it('preserves PR candidates without broadening issue policy and fails on incomplete API reads', async () => {
    const pr = { kind: 'pr', number: 2, authorized: true }
    expect(
      await authorizedFixMainCandidates({
        json: JSON.stringify([pr]),
        repository,
        read: async () => {
          throw new Error('unexpected PR read')
        },
      }),
    ).toEqual([pr])
    await expect(
      authorizedFixMainCandidates({
        json: JSON.stringify([candidate]),
        repository,
        read: async () => {
          throw new Error('API unavailable')
        },
      }),
    ).rejects.toThrow('API unavailable')
  })

  it('rejects oversized and malformed candidate input before API work', async () => {
    for (const candidates of [
      Array.from({ length: 11 }, () => candidate),
      [{ kind: 'issue', number: '../2' }],
    ]) {
      await expect(
        authorizedFixMainCandidates({
          json: JSON.stringify(candidates),
          repository,
          read: async () => {
            throw new Error('unexpected read')
          },
        }),
      ).rejects.toThrow(/Expected at most ten|Invalid related issue/)
    }
  })
})
