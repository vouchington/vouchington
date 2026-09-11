import { describe, expect, it } from 'vitest'

import { createGhPackageJsonReader, createLocalPackageJsonReader } from '../package-json-source.mts'

const REPO = 'jonathanong/filaments'
const BASE_REF_OID = 'aaa0000'
const HEAD_REF_OID = 'bbb1111'
const MERGE_BASE_SHA = 'ccc2222'

describe('createLocalPackageJsonReader', () => {
  it('resolves the base side via merge-base, not origin/main directly', async () => {
    const calls: string[][] = []
    const runGit = (args: string[]) => {
      calls.push(args)
      if (args[0] === 'merge-base') return Promise.resolve(`${MERGE_BASE_SHA}\n`)
      return Promise.resolve('{"scripts":{}}')
    }
    const read = createLocalPackageJsonReader(runGit)
    await read('backend/package.json', 'base')
    expect(calls).toEqual([
      ['merge-base', 'origin/main', 'HEAD'],
      ['show', `${MERGE_BASE_SHA}:backend/package.json`],
    ])
  })

  it('reads the head side directly from HEAD, with no merge-base call', async () => {
    const calls: string[][] = []
    const runGit = (args: string[]) => {
      calls.push(args)
      return Promise.resolve('{"scripts":{}}')
    }
    const read = createLocalPackageJsonReader(runGit)
    await read('backend/package.json', 'head')
    expect(calls).toEqual([['show', 'HEAD:backend/package.json']])
  })

  it('memoizes the merge-base resolution across multiple base reads', async () => {
    let mergeBaseCalls = 0
    const runGit = (args: string[]) => {
      if (args[0] === 'merge-base') {
        mergeBaseCalls += 1
        return Promise.resolve(MERGE_BASE_SHA)
      }
      return Promise.resolve('{"scripts":{}}')
    }
    const read = createLocalPackageJsonReader(runGit)
    await Promise.all([read('backend/package.json', 'base'), read('web/package.json', 'base')])
    expect(mergeBaseCalls).toBe(1)
  })

  it('returns undefined instead of throwing when the read fails', async () => {
    const runGit = () => Promise.reject(new Error('fatal: not a git repository'))
    const read = createLocalPackageJsonReader(runGit)
    await expect(read('backend/package.json', 'head')).resolves.toBeUndefined()
  })
})

describe('createGhPackageJsonReader', () => {
  function fakeRunGh(compareBody: string) {
    const calls: string[][] = []
    const runGh = (args: string[]) => {
      calls.push(args)
      if (args[1]?.startsWith('repos/') && args[1].includes('/compare/')) {
        return Promise.resolve(compareBody)
      }
      return Promise.resolve('{"scripts":{}}')
    }
    return { calls, runGh }
  }

  it('resolves the base side via compare().merge_base_commit.sha, not baseRefOid directly', async () => {
    const { calls, runGh } = fakeRunGh(
      JSON.stringify({ merge_base_commit: { sha: MERGE_BASE_SHA }, merge_base_sha: '' }),
    )
    const read = createGhPackageJsonReader(runGh, REPO, BASE_REF_OID, HEAD_REF_OID)
    await read('backend/package.json', 'base')
    expect(calls).toEqual([
      ['api', `repos/${REPO}/compare/${BASE_REF_OID}...${HEAD_REF_OID}`],
      [
        'api',
        '-X',
        'GET',
        `repos/${REPO}/contents/backend/package.json`,
        '-f',
        `ref=${MERGE_BASE_SHA}`,
        '-H',
        'Accept: application/vnd.github.raw',
      ],
    ])
  })

  it('reads the head side directly from headRefOid, with no compare call', async () => {
    const { calls, runGh } = fakeRunGh('{}')
    const read = createGhPackageJsonReader(runGh, REPO, BASE_REF_OID, HEAD_REF_OID)
    await read('backend/package.json', 'head')
    expect(calls).toEqual([
      [
        'api',
        '-X',
        'GET',
        `repos/${REPO}/contents/backend/package.json`,
        '-f',
        `ref=${HEAD_REF_OID}`,
        '-H',
        'Accept: application/vnd.github.raw',
      ],
    ])
  })

  it('memoizes the merge-base resolution across multiple base reads', async () => {
    let compareCalls = 0
    const runGh = (args: string[]) => {
      if (args[1]?.includes('/compare/')) {
        compareCalls += 1
        return Promise.resolve(JSON.stringify({ merge_base_commit: { sha: MERGE_BASE_SHA } }))
      }
      return Promise.resolve('{}')
    }
    const read = createGhPackageJsonReader(runGh, REPO, BASE_REF_OID, HEAD_REF_OID)
    await Promise.all([read('backend/package.json', 'base'), read('web/package.json', 'base')])
    expect(compareCalls).toBe(1)
  })

  it('returns undefined instead of throwing when merge_base_commit.sha is absent (the landmine field)', async () => {
    const { runGh } = fakeRunGh(JSON.stringify({ merge_base_sha: 'wrong-field-would-be-here' }))
    const read = createGhPackageJsonReader(runGh, REPO, BASE_REF_OID, HEAD_REF_OID)
    await expect(read('backend/package.json', 'base')).resolves.toBeUndefined()
  })

  it('returns undefined instead of throwing when the content fetch fails', async () => {
    const runGh = (args: string[]) => {
      if (args[1]?.includes('/compare/')) return Promise.reject(new Error('not found'))
      return Promise.resolve('{}')
    }
    const read = createGhPackageJsonReader(runGh, REPO, BASE_REF_OID, HEAD_REF_OID)
    await expect(read('backend/package.json', 'base')).resolves.toBeUndefined()
  })
})
