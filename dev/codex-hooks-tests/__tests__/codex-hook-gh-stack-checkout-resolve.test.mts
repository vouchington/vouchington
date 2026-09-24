import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { staleLayerBranches } from '../../codex-hooks/policy/github-stack-checkout-branches.mts'
import {
  defaultResolveStackForCheckout,
  UNRESOLVED_REPOSITORY,
} from '../../codex-hooks/policy/github-stack-checkout-resolve.mts'
import { git, withRepo } from '../../test-helpers/stack-checkout-repo.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

// Answers `gh api --include [--hostname <host>] repos/<owner>/<repo>/<path>` from responses.json the
// way gh does: a status line, headers, a blank line, then the body, exiting 1 for a non-2xx status.
// A path with no canned response gets no HTTP output at all, and "hang" never answers. The shebang
// makes node the process a SIGKILL hits.
const FAKE_GH = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs')
const args = process.argv.slice(2)
const [, repo, path] = /^repos\\/([^/]+\\/[^/]+)\\/(.+)$/.exec(args.at(-1))
const host = args.includes('--hostname') ? args[args.indexOf('--hostname') + 1] : ''
appendFileSync(process.env.FAKE_GH_CALLS, JSON.stringify({ host, repo, path }) + '\\n')
const response = JSON.parse(readFileSync(process.env.FAKE_GH_RESPONSES, 'utf8'))[path]
if (response === 'hang') {
  setTimeout(() => {}, 30_000)
} else if (response === undefined) {
  process.exitCode = 1
} else {
  const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body)
  process.stdout.write('HTTP/2.0 ' + response.status + ' X\\nContent-Type: application/json\\r\\n\\r\\n' + body)
  process.exitCode = response.status >= 200 && response.status < 300 ? 0 : 1
}
`

const BY_PULL = 'stacks?pull_request=7'
const NOT_FOUND = { status: 404, body: { message: 'Not Found' } }
const SERVER_ERROR = { status: 500, body: { message: 'Server Error' } }
const ok = (body: unknown) => ({ status: 200, body })
const stack = (number: number, ...prs: number[]) => ({
  number,
  pull_requests: prs.map(pr => ({ number: pr })),
})

const dirs: string[] = []

type Call = { host: string; repo: string; path: string }

// A worktree whose origin is acme/widgets on github.com, with a fake gh first on PATH.
function fakeGh(responses: Record<string, unknown>, env: Record<string, string | undefined> = {}) {
  const dir = makeTestTempDirSync('fake-gh-')
  dirs.push(dir)
  git(dir, ['init', '-q'])
  git(dir, ['remote', 'add', 'origin', 'https://github.com/acme/widgets.git'])
  writeFileSync(join(dir, 'gh'), FAKE_GH, { mode: 0o755 })
  writeFileSync(join(dir, 'responses.json'), JSON.stringify(responses))
  writeFileSync(join(dir, 'calls.log'), '')
  const ghEnv = {
    FAKE_GH_CALLS: join(dir, 'calls.log'),
    FAKE_GH_RESPONSES: join(dir, 'responses.json'),
    GH_REPO: undefined,
    PATH: `${dir}${delimiter}${process.env.PATH}`,
    ...env,
  }
  const calls = () =>
    readFileSync(ghEnv.FAKE_GH_CALLS, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as Call)
  return {
    calls: () => calls().map(call => call.path),
    targets: () => [...new Set(calls().map(call => `${call.host} ${call.repo}`))],
    resolve: (deadline = Date.now() + 10_000) =>
      defaultResolveStackForCheckout(dir, ghEnv, 7, deadline),
  }
}

describe('Codex hook gh stack checkout reads', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true })
    }
  })

  describe('stack resolution', () => {
    it.each([
      ['PR 7 is not listed', NOT_FOUND],
      ['PR 7 is in no stack', ok([])],
      ['PR 7 is in stack 7', ok([stack(7, 7)])],
    ])('returns stack 7 when it has layers and %s', (_label, byPull) => {
      const gh = fakeGh({ 'stacks/7': ok(stack(7, 101)), [BY_PULL]: byPull })
      expect(gh.resolve()).toEqual([stack(7, 101)])
      expect(gh.calls()).toEqual(['stacks/7', BY_PULL])
    })

    it.each([
      ['is not found', NOT_FOUND],
      ['has no layers', ok(stack(7))],
    ])("falls back to PR 7's stack when stack 7 %s, like gh-stack", (_label, byNumber) => {
      const gh = fakeGh({ 'stacks/7': byNumber, [BY_PULL]: ok([stack(9, 7)]) })
      expect(gh.resolve()).toEqual([stack(9, 7)])
    })

    it('returns both stacks when the checkout could import either', () => {
      const gh = fakeGh({ 'stacks/7': ok(stack(7, 101)), [BY_PULL]: ok([stack(9, 7)]) })
      expect(gh.resolve()).toEqual([stack(7, 101), stack(9, 7)])
    })

    it("takes only the first stack that lists PR 7, as gh-stack's import does", () => {
      const gh = fakeGh({ 'stacks/7': NOT_FOUND, [BY_PULL]: ok([stack(9, 7), stack(10, 7)]) })
      expect(gh.resolve()).toEqual([stack(9, 7)])
    })

    it("reads the repository of the worktree's remote on github.com", () => {
      const gh = fakeGh({ 'stacks/7': ok(stack(7, 101)), [BY_PULL]: NOT_FOUND })
      gh.resolve()
      expect(gh.targets()).toEqual(['github.com acme/widgets'])
    })

    it('reads GH_REPO on the default gh host when it names no host, like gh-stack', () => {
      const gh = fakeGh(
        { 'stacks/7': ok(stack(7, 101)), [BY_PULL]: NOT_FOUND },
        { GH_REPO: 'other-owner/other-repo' },
      )
      expect(gh.resolve()).toEqual([stack(7, 101)])
      expect(gh.targets()).toEqual([' other-owner/other-repo'])
    })

    it('reads no stack when the hook cannot tell the repository', () => {
      const gh = fakeGh({ 'stacks/7': ok(stack(7, 101)) }, { GH_REPO: 'ghe.example/acme/widgets' })
      expect(gh.resolve()).toBe(UNRESOLVED_REPOSITORY)
      expect(gh.calls()).toEqual([])
    })

    it("fails closed without reading PR 7's stack when the stack read errors", () => {
      const gh = fakeGh({ 'stacks/7': SERVER_ERROR, [BY_PULL]: ok([stack(9, 7)]) })
      expect(gh.resolve()).toBeUndefined()
      expect(gh.calls()).toEqual(['stacks/7'])
    })

    it.each([
      ["PR 7's stack read errors", { 'stacks/7': ok(stack(7, 101)), [BY_PULL]: SERVER_ERROR }],
      ['gh prints no HTTP response', { 'stacks/7': ok(stack(7, 101)) }],
      ['the body is not JSON', { 'stacks/7': ok('<html>'), [BY_PULL]: NOT_FOUND }],
      ['the stack list is not a list', { 'stacks/7': ok(stack(7, 101)), [BY_PULL]: ok({}) }],
      ['stack 7 reports another number', { 'stacks/7': ok(stack(8, 101)), [BY_PULL]: NOT_FOUND }],
      ['neither stack exists', { 'stacks/7': NOT_FOUND, [BY_PULL]: ok([]) }],
      ['no stack 7 layers and no PR stack', { 'stacks/7': ok(stack(7)), [BY_PULL]: NOT_FOUND }],
      ["PR 7's stack does not contain it", { 'stacks/7': NOT_FOUND, [BY_PULL]: ok([stack(9, 8)]) }],
      ["PR 7's stack has no layers", { 'stacks/7': NOT_FOUND, [BY_PULL]: ok([stack(9)]) }],
      ["PR 7's stack is not an object", { 'stacks/7': NOT_FOUND, [BY_PULL]: ok(['stack']) }],
    ])('fails closed when %s', (_label, responses) => {
      expect(fakeGh(responses).resolve()).toBeUndefined()
    })

    it('kills a gh call that outlives the deadline', () => {
      const gh = fakeGh({ 'stacks/7': 'hang' })
      const started = Date.now()
      expect(gh.resolve(started + 2_000)).toBeUndefined()
      expect(Date.now() - started).toBeLessThan(10_000)
      expect(gh.calls()).toEqual(['stacks/7'])
    })

    it('starts no gh call once the deadline has passed', () => {
      const gh = fakeGh(
        { 'stacks/7': ok(stack(7, 101)), [BY_PULL]: NOT_FOUND },
        { GH_REPO: 'acme/widgets' },
      )
      expect(gh.resolve(Date.now())).toBeUndefined()
      expect(gh.calls()).toEqual([])
    })
  })

  describe('local branch reads', () => {
    it('kills a git call that outlives the deadline', () => {
      withRepo(({ dir, base }) => {
        const fakeGitDir = makeTestTempDirSync('fake-git-')
        dirs.push(fakeGitDir)
        const started = join(fakeGitDir, 'started')
        writeFileSync(join(fakeGitDir, 'git'), `#!/bin/sh\ntouch '${started}'\nexec sleep 30\n`, {
          mode: 0o755,
        })
        vi.stubEnv('PATH', `${fakeGitDir}${delimiter}${process.env.PATH}`)
        const startedAt = Date.now()
        const layers = [{ pr: 101, ref: 'layer-1', sha: base }]
        expect(staleLayerBranches(dir, layers, startedAt + 2_000)).toBeUndefined()
        expect(Date.now() - startedAt).toBeLessThan(10_000)
        expect(existsSync(started)).toBe(true)
      })
    })
  })
})
