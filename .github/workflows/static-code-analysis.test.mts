import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/static-code-analysis.yml', 'utf8')

describe('static-code-analysis workflow', () => {
  it('runs the repository AST-grep aggregate including shared example validation', () => {
    expect(workflow).toContain('run: pnpm run ast-grep')
    expect(workflow).not.toContain('run: node_modules/@ast-grep/cli/ast-grep scan')
  })

  it('runs directly for every main push and serializes direct and reusable invocations', () => {
    expect(workflow).toContain('  push:\n    branches: [main]')
    expect(workflow).not.toMatch(/push:\n(?: {4}.*\n)* {4}paths:/)
    expect(workflow).toContain(
      'group: static-code-analysis-${{ github.event.pull_request.number || github.ref_name }}',
    )
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}")
  })

  it('delegates Node and pnpm installation to the shared setup-node-pnpm action', () => {
    expect(workflow).toContain('      - uses: ./.github/actions/setup-node-pnpm')
    expect(workflow).not.toContain('      - name: Activate pnpm via corepack')
    expect(workflow).not.toContain('      - name: Install workspace dependencies')
    expect(workflow).not.toContain('nick-fields/retry')
    expect(workflow).not.toContain('ci/static-analysis-pnpm-install.sh')
  })

  it('runs compiler gates before fallible repository static-analysis commands', () => {
    expect(workflow.indexOf('      - name: Typecheck scripts')).toBeLessThan(
      workflow.indexOf('      - name: Install CI tools via mise'),
    )
  })

  it('checks the row catalog through the no-write Platform formatter', () => {
    expect(workflow).toContain(
      '      - name: Check localization catalog format\n        if: ${{ inputs.docs_only != true }}\n        run: pnpm exec vouchington-localization format --check --source localization/catalog',
    )
  })

  it('installs CI tools via mise and runs them before static checks', () => {
    const miseStep = workflow.indexOf('      - name: Install CI tools via mise')
    const repoChecksStep = workflow.indexOf('      - name: Repo Node static checks')

    expect(miseStep).toBeGreaterThanOrEqual(0)
    expect(repoChecksStep).toBeGreaterThan(miseStep)
    expect(workflow).toMatch(/jdx\/mise-action@/)
    expect(workflow).not.toContain('./ci/install-selene.sh')
    expect(workflow).not.toContain('./ci/install-shellcheck.sh')
    expect(workflow).not.toContain('./ci/install-ripgrep.sh')
    // actions/cache (mise-action's default) hangs on self-hosted runners — must be disabled.
    expect(workflow.slice(miseStep, repoChecksStep)).toContain('cache: false')
  })

  it('delegates link validation to the standalone Lint Links workflow', () => {
    expect(workflow).not.toContain('./.github/actions/setup-lychee')
    expect(workflow).not.toContain('./ci/lint-links.sh --offline')
  })

  it('does not run a separate no-mistakes Playwright check', () => {
    expect(workflow).not.toContain('Run no-mistakes Playwright coverage')
    expect(workflow).not.toContain('no-mistakes playwright check')
    expect(workflow).not.toContain('--assert-unique-test-ids')
    expect(workflow).not.toContain('--assert-unique-html-ids')
  })

  it('delegates Rust and AGENTS.md rules to no-mistakes check', () => {
    expect(workflow).not.toContain('no-mistakes-rust-no-inline-tests')
    expect(workflow).not.toContain('no-mistakes-agents-md-max-size')
    expect(workflow).not.toContain('static-code-analysis/rust-no-inline-tests.sh')
    expect(workflow).not.toContain('static-code-analysis/agents-md-max-size/agents-md-max-size.sh')
    expect(workflow).toContain(
      '      - name: Run no-mistakes\n        run: pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
    )
  })

  it('accepts a docs_only workflow_call input that defaults false so main push stays full', () => {
    expect(workflow).toMatch(
      /workflow_call:\n {4}inputs:\n {6}docs_only:\n(?: {8}.*\n)* {8}type: boolean\n(?: {8}.*\n)* {8}default: false/,
    )
    expect(workflow).toContain('if: ${{ inputs.docs_only != true }}')
    expect(workflow).toContain('if: ${{ inputs.docs_only == true }}')
  })

  it('keeps markdown-relevant checks on docs-only PRs and skips TypeScript lint graph work', () => {
    const noMistakesStep = workflow.indexOf('      - name: Run no-mistakes')
    const liveTopologyStep = workflow.indexOf('      - name: Check live workflow topology')
    const routeSelectorStep = workflow.indexOf(
      '      - name: Check web route localization selector map',
    )
    const typecheckScripts = workflow.indexOf('      - name: Typecheck scripts')
    const oxlint = workflow.indexOf('pnpm exec oxlint --type-aware --deny-warnings')
    const knip = workflow.indexOf('pnpm exec knip --treat-config-hints-as-errors')

    expect(noMistakesStep).toBeGreaterThanOrEqual(0)
    expect(liveTopologyStep).toBeGreaterThan(noMistakesStep)
    expect(routeSelectorStep).toBeGreaterThan(liveTopologyStep)
    expect(workflow.slice(noMistakesStep, liveTopologyStep)).not.toContain(
      'if: ${{ inputs.docs_only != true }}',
    )
    expect(workflow.slice(liveTopologyStep, routeSelectorStep)).toContain(
      'if: ${{ inputs.docs_only != true }}',
    )
    expect(workflow.slice(typecheckScripts, typecheckScripts + 120)).toContain(
      'if: ${{ inputs.docs_only != true }}',
    )
    expect(workflow.slice(oxlint, oxlint + 120)).toContain('if: ${{ inputs.docs_only != true }}')
    expect(workflow.slice(knip, knip + 120)).toContain('if: ${{ inputs.docs_only != true }}')
    expect(workflow).toContain(
      'node static-code-analysis/run-node-checks.mts --checks repo-file-policy,targeted-guardrails,config-inventory-policy',
    )
    const mise = workflow.indexOf('      - name: Install CI tools via mise')
    expect(mise).toBeGreaterThanOrEqual(0)
    expect(workflow.slice(mise, oxlint)).not.toContain('if: ${{ inputs.docs_only')
    const oxfmt = workflow.indexOf('pnpm exec oxfmt --check')
    expect(oxfmt).toBeGreaterThan(knip)
    expect(workflow.slice(oxfmt, oxfmt + 80)).not.toContain('if: ${{ inputs.docs_only != true }}')
  })

  it('runs no-mistakes after static checks without a cross-PR job queue', () => {
    const parsed = load(workflow) as {
      jobs: Record<string, { needs?: string[]; concurrency?: unknown; 'timeout-minutes'?: number }>
    }
    const noMistakes = parsed.jobs['no-mistakes-owned']

    expect(noMistakes).toBeDefined()
    expect(noMistakes?.needs).toEqual(['static-code-analysis'])
    expect(noMistakes?.concurrency).toBeUndefined()
    expect(noMistakes?.['timeout-minutes']).toBeLessThanOrEqual(30)
    expect(parsed.jobs['static-code-analysis']?.['timeout-minutes']).toBeLessThanOrEqual(30)
  })

  it('runs remaining repo-owned static checks in CI', () => {
    // Extract the --checks value and tokenize it so the assertion is order-insensitive
    // and resilient to new checks being added without test edits.
    const checksMatch = workflow.match(/run-node-checks\.mts --checks (\S+)/)
    expect(checksMatch).not.toBeNull()
    const checksSet = new Set(checksMatch![1].split(','))

    for (const check of [
      'config-inventory-policy',
      'repo-file-policy',
      'scc-complexity',
      'targeted-guardrails',
    ]) {
      expect(checksSet.has(check)).toBe(true)
    }

    for (const delegated of [
      'agent-test-coverage',
      'backend-repo-structure',
      'lint-agent-skills',
      'mts-extensions',
      'no-git-identity-mutation',
      'queue-worker-required-files',
      'queue-worker-strict-file-structure',
      'required-local-docs',
      'web-middleware-to-proxy',
      'worker-valkey-docs-policy',
    ]) {
      expect(checksSet.has(delegated)).toBe(false)
    }
  })

  it('retains only cross-workspace dependency and type checks', () => {
    expect(workflow).toContain(
      'node static-code-analysis/run-tooling-dependency-cruiser.mts --cache',
    )
    expect(workflow).toContain('--do-not-follow "^(?!playwright/tests/)" playwright/tests')
    expect(workflow).toContain('pnpm exec tsc --noEmit --project tsconfig.json')
    expect(workflow).toContain('pnpm exec tsc --noEmit --project ts-shared/tsconfig.json')
    expect(workflow).toContain('pnpm exec tsc --noEmit --project playwright/tsconfig.json')
    expect(workflow).toContain('pnpm exec tsc --noEmit --project test-helpers/tsconfig.json')
    expect(workflow).toContain('pnpm exec tsc --noEmit --project integration-tests/tsconfig.json')
    for (const delegated of [
      'backend/.dependency-cruiser.cjs',
      'web/.dependency-cruiser.cjs',
      'lambdas/.dependency-cruiser.cjs',
      'backend/tsconfig.json',
      'web/tsconfig.json',
      'cloudflare-worker/tsconfig.json',
      'lambdas/tsconfig.json',
      'pnpm exec squawk',
      'Next.js pages-router check',
    ]) {
      expect(workflow).not.toContain(delegated)
    }
  })
})
