import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { staleLayerBranches } from '../../codex-hooks/policy/github-stack-checkout-branches.mts'
import { defaultResolveStackForCheckout } from '../../codex-hooks/policy/github-stack-checkout-resolve.mts'
import { withRepo } from '../../test-helpers/stack-checkout-repo.mts'
import { makeTestTempDirSync } from '../test-temp-root.mts'

// Answers `gh api --include <path>` from responses.json the way gh does: a status line, headers, a
// blank line, then the body, exiting 1 for a non-2xx status. A path with no canned response gets no
// HTTP output at all, and "hang" never answers. The shebang makes node the process a SIGKILL hits.
const FAKE_GH = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs')
const path = process.argv[4].replace('repos/{owner}/{repo}/', '')
appendFileSync(process.env.FAKE_GH_CALLS, path + '\\n')
const response = JSON.parse(readFileSync(process.env.FAKE_GH_RESPONSES, 'utf8'))[path]
if (response === 'hang') {
  setTimeout(() => {}, 30_000)
} else if (response === undefined) {
  process.exitCode = 1
} else {
  const body = typeof response.body === 'string' ? response.body : JSON.stringify(response.body)
  process.stdout.write('HTTP/2.0 ' + response.status + ' X\\r\\nContent-Type: application/json\\r\\n\\r\\n' + body)
  process.exitCode = response.status >= 200 && response.status < 300 ? 0 : 1
}
`

const NOT_FOUND = { status: 404, body: { message: 'Not Found' } }
const SERVER_ERROR = { status: 500, body: { message: 'Server Error' } }
const ok = (body: unknown) => ({ status: 200, body })
const stack = (number: number, ...prs: number[]) => ({
  number,
  pull_requests: prs.map(pr => ({ number: pr })),
})
const pullIn = (stackNumber: number | null) =>
  ok({ number: 7, stack: stackNumber === null ? null : { number: stackNumber, position: 1 } })

const dirs: string[] = []

function fakeGh(responses: Record<string, unknown>) {
  const dir = makeTestTempDirSync('fake-gh-')
  dirs.push(dir)
  writeFileSync(join(dir, 'gh'), FAKE_GH, { mode: 0o755 })
  writeFileSync(join(dir, 'responses.json'), JSON.stringify(responses))
  writeFileSync(join(dir, 'calls.log'), '')
  const env = {
    FAKE_GH_CALLS: join(dir, 'calls.log'),
    FAKE_GH_RESPONSES: join(dir, 'responses.json'),
    PATH: `${dir}${delimiter}${process.env.PATH}`,
  }
  return {
    calls: () => readFileSync(env.FAKE_GH_CALLS, 'utf8').split('\n').filter(Boolean),
    resolve: (deadline = Date.now() + 10_000) =>
      defaultResolveStackForCheckout(dir, env, 7, deadline),
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
      ['PR 7 does not exist', NOT_FOUND],
      ['PR 7 is not stacked', pullIn(null)],
      ['PR 7 is in stack 7', pullIn(7)],
    ])('returns stack 7 when it has layers and %s', (_label, pull) => {
      const gh = fakeGh({ 'stacks/7': ok(stack(7, 101)), 'pulls/7': pull })
      expect(gh.resolve()).toEqual([stack(7, 101)])
      expect(gh.calls()).toEqual(['stacks/7', 'pulls/7'])
    })

    it.each([
      ['is not found', NOT_FOUND],
      ['has no layers', ok(stack(7))],
    ])("falls back to PR 7's stack when stack 7 %s, like gh-stack", (_label, byNumber) => {
      const gh = fakeGh({ 'stacks/7': byNumber, 'pulls/7': pullIn(9), 'stacks/9': ok(stack(9, 7)) })
      expect(gh.resolve()).toEqual([stack(9, 7)])
      expect(gh.calls()).toEqual(['stacks/7', 'pulls/7', 'stacks/9'])
    })

    it('returns both stacks when the checkout could import either', () => {
      const gh = fakeGh({
        'stacks/7': ok(stack(7, 101)),
        'pulls/7': pullIn(9),
        'stacks/9': ok(stack(9, 7)),
      })
      expect(gh.resolve()).toEqual([stack(7, 101), stack(9, 7)])
    })

    it('fails closed without reading the PR when the stack read errors', () => {
      const gh = fakeGh({ 'stacks/7': SERVER_ERROR, 'pulls/7': pullIn(9) })
      expect(gh.resolve()).toBeUndefined()
      expect(gh.calls()).toEqual(['stacks/7'])
    })

    it.each([
      ['the PR read errors', { 'stacks/7': ok(stack(7, 101)), 'pulls/7': SERVER_ERROR }],
      ['gh prints no HTTP response', { 'stacks/7': ok(stack(7, 101)) }],
      ['the body is not JSON', { 'stacks/7': ok('<html>'), 'pulls/7': NOT_FOUND }],
      ['the PR body is not an object', { 'stacks/7': ok(stack(7, 101)), 'pulls/7': ok('"PR"') }],
      ['stack 7 reports another number', { 'stacks/7': ok(stack(8, 101)), 'pulls/7': NOT_FOUND }],
      [
        "the PR's stack number is malformed",
        { 'stacks/7': NOT_FOUND, 'pulls/7': ok({ stack: {} }) },
      ],
      ['neither stack exists', { 'stacks/7': NOT_FOUND, 'pulls/7': pullIn(null) }],
      ['no stack 7 layers and no PR', { 'stacks/7': ok(stack(7)), 'pulls/7': NOT_FOUND }],
      [
        "the PR's stack is not found",
        { 'stacks/7': NOT_FOUND, 'pulls/7': pullIn(9), 'stacks/9': NOT_FOUND },
      ],
      [
        "the PR's stack does not contain it",
        { 'stacks/7': NOT_FOUND, 'pulls/7': pullIn(9), 'stacks/9': ok(stack(9, 8)) },
      ],
      [
        "the PR's stack reports another number",
        { 'stacks/7': NOT_FOUND, 'pulls/7': pullIn(9), 'stacks/9': ok(stack(10, 7)) },
      ],
    ])('fails closed when %s', (_label, responses) => {
      expect(fakeGh(responses).resolve()).toBeUndefined()
    })

    it('kills a gh call that outlives the deadline', () => {
      const gh = fakeGh({ 'stacks/7': 'hang' })
      const started = Date.now()
      expect(gh.resolve(started + 300)).toBeUndefined()
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(gh.calls()).toEqual(['stacks/7'])
    })

    it('starts no gh call once the deadline has passed', () => {
      const gh = fakeGh({ 'stacks/7': ok(stack(7, 101)), 'pulls/7': NOT_FOUND })
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
        expect(staleLayerBranches(dir, layers, startedAt + 300)).toBeUndefined()
        expect(Date.now() - startedAt).toBeLessThan(5_000)
        expect(existsSync(started)).toBe(true)
      })
    })
  })
})
