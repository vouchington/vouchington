import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isLockOwningScript,
  isPackageScriptBuildLockStep,
  parsePnpmInvocation,
} from './build-lock-pnpm-resolution.mts'

describe('parsePnpmInvocation', () => {
  it.each([
    ['pnpm run build', '.', { dir: '.', script: 'build' }],
    ['pnpm build', '.', { dir: '.', script: 'build' }],
    ['pnpm --dir web run build', '.', { dir: join('.', 'web'), script: 'build' }],
    ['pnpm --dir web build', 'root', { dir: join('root', 'web'), script: 'build' }],
  ])('parses %j (relative to %j)', (command, dir, expected) => {
    expect(parsePnpmInvocation(command, dir)).toEqual(expected)
  })

  it.each([
    'pnpm exec vitest run', // no bare-script form: `exec` never matches the optional `run` group
    'pnpm run build --filter web', // trailing args after the script name break the `$` anchor
    'npm run build', // wrong package manager entirely
    'pnpm --dir web', // --dir with no script to run
  ])('does not match %s', command => {
    expect(parsePnpmInvocation(command, '.')).toBeNull()
  })
})

describe('isLockOwningScript / isPackageScriptBuildLockStep', () => {
  it('resolves a root package script that forwards to a lock-owning script one directory down', () => {
    // Mirrors the real, live shape of root package.json's `build:storybook` ->
    // `pnpm --dir web run build-storybook` (@chatgpt-codex-connector, PR #11084: "or through a root
    // forwarding script") — proves the recursion actually resolves a two-manifest hop, not just the
    // single-manifest case exercised by checks-static.yml today.
    const root = mkdtempSync(join(tmpdir(), 'pnpm-invocation-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { 'build:storybook': 'pnpm --dir web run build-storybook' } }),
      )
      mkdirSync(join(root, 'web'))
      writeFileSync(
        join(root, 'web', 'package.json'),
        JSON.stringify({
          scripts: { 'build-storybook': 'bash ci/with-build-lock.sh storybook true' },
        }),
      )

      expect(isLockOwningScript(root, 'build:storybook')).toBe(true)
      expect(
        isPackageScriptBuildLockStep({
          run: 'pnpm run build:storybook',
          'working-directory': root,
        }),
      ).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not treat a script that forwards to a non-lock-owning script as lock-owning', () => {
    // Mirrors the real setup-backend/action.yml `working-directory: email-templates` +
    // `run: pnpm run build` step, whose email-templates/package.json `build` script is
    // `node build.mjs` — a true negative that must stay a true negative.
    const root = mkdtempSync(join(tmpdir(), 'pnpm-invocation-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { build: 'node build.mjs' } }),
      )

      expect(isLockOwningScript(root, 'build')).toBe(false)
      expect(
        isPackageScriptBuildLockStep({ run: 'pnpm run build', 'working-directory': root }),
      ).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('resolves against an inherited working directory when the step sets none', () => {
    // Mirrors a job with `defaults.run.working-directory: web` (or the equivalent
    // workflow-level default) and a step whose own `run:` omits `working-directory`
    // (@chatgpt-codex-connector, PR #11084).
    const root = mkdtempSync(join(tmpdir(), 'pnpm-invocation-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { build: 'bash ci/with-build-lock.sh true' } }),
      )

      expect(isPackageScriptBuildLockStep({ run: 'pnpm run build' }, root)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("prefers the step's own working-directory over an inherited default", () => {
    const inherited = mkdtempSync(join(tmpdir(), 'pnpm-invocation-'))
    const stepOwn = mkdtempSync(join(tmpdir(), 'pnpm-invocation-'))
    try {
      writeFileSync(
        join(inherited, 'package.json'),
        JSON.stringify({ scripts: { build: 'bash ci/with-build-lock.sh true' } }),
      )
      writeFileSync(
        join(stepOwn, 'package.json'),
        JSON.stringify({ scripts: { build: 'node build.mjs' } }),
      )

      expect(
        isPackageScriptBuildLockStep(
          { run: 'pnpm run build', 'working-directory': stepOwn },
          inherited,
        ),
      ).toBe(false)
    } finally {
      rmSync(inherited, { recursive: true, force: true })
      rmSync(stepOwn, { recursive: true, force: true })
    }
  })

  it('does not loop forever on a script-forwarding cycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'pnpm-invocation-'))
    try {
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ scripts: { a: 'pnpm run b', b: 'pnpm run a' } }),
      )

      expect(isLockOwningScript(root, 'a')).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
