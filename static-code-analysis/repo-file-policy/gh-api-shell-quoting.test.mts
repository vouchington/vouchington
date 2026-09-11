// Regression guard for issue #10956: an unquoted `?`/`&` in a `gh api` argument silently
// backgrounds the command (rc=0, truncated query) or fails only under zsh glob-nomatch. This is
// the Vitest-run counterpart to gh-api-shell-quoting-guard.mts, which is the one wired into
// `pnpm run repo-file-policy` and Static Code Analysis — see gh-api-shell-quoting.mts for the
// shared file predicates both consumers use and `vouchington-tooling/gh-api-shell-quoting`
// for the detection algorithm and its rationale.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  isGhApiShellScriptFile,
  isGhApiWorkflowFile,
  shellScriptViolations,
  workflowYamlViolations,
} from './gh-api-shell-quoting.mts'

const root = resolve(import.meta.dirname, '../..')

function allTrackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
}

describe('gh api shell-quoting guard', () => {
  it('flags an unquoted `?` right after the gh api argument starts', () => {
    expect(shellScriptViolations('gh api repos/x/y?a=1&b=2\n')).toHaveLength(1)
  })

  it('flags an unquoted `&` that would silently background the command', () => {
    expect(shellScriptViolations('gh api "repos/x/labels" -f name=foo&color=bar\n')).toHaveLength(1)
  })

  it('stays silent on a fully double-quoted URL carrying both `?` and `&`', () => {
    expect(shellScriptViolations('gh api "repos/x/y?a=1&b=2"\n')).toEqual([])
  })

  it('stays silent on a fully single-quoted URL carrying both `?` and `&`', () => {
    expect(shellScriptViolations("gh api 'repos/x/y?a=1&b=2'\n")).toEqual([])
  })

  it('stays silent on a `${{ }}` expression with no query string', () => {
    expect(shellScriptViolations('gh api "repos/${{ github.repository }}/labels"\n')).toEqual([])
  })

  it('stays silent on a `?` that only appears inside a trailing comment', () => {
    expect(shellScriptViolations('gh api "repos/x/y" # example: ?recursive=1\n')).toEqual([])
  })

  it('stays silent on a legitimate `&&` operator after a quoted call', () => {
    expect(shellScriptViolations('gh api "repos/x/y" && echo done\n')).toEqual([])
  })

  it('stays silent on a legitimate standalone `&` backgrounding a fully-quoted call', () => {
    // A `&` preceded by whitespace ends a complete, fully-quoted command by backgrounding it —
    // Bash treats it like `&&` here, not as an unsafe argument character (#10956 review).
    expect(shellScriptViolations('gh api "repos/x/y" &\n')).toEqual([])
  })

  it('stays silent on a `2>&1` redirect after a fully-quoted call', () => {
    // The `&` here immediately follows `>`, making this a file-descriptor-duplication redirect
    // (`2>&1`) — pervasive in this repo's own ci/*.sh scripts — not an unsafe argument character
    // (#10956 review).
    expect(shellScriptViolations('gh api "repos/x/y" >/dev/null 2>&1\n')).toEqual([])
  })

  it('stays silent on a `>&2` redirect after a fully-quoted call', () => {
    expect(shellScriptViolations('gh api "repos/x/y" >&2\n')).toEqual([])
  })

  it('flags an unsafe argument after a `2>&1` redirect on the same logical line', () => {
    // The `&` in `2>&1` is a redirect, not the background operator, so it must not end the
    // argument list — the unquoted `?` later in the same call is still unsafe (#11027 review).
    expect(shellScriptViolations('gh api "repos/x/y" 2>&1 repos/z?a=1\n')).toHaveLength(1)
    expect(shellScriptViolations('gh api "repos/x/y" >&2 repos/z?a=1\n')).toHaveLength(1)
    expect(shellScriptViolations('gh api "repos/x/y" 2>&1 -f name=foo&color=bar\n')).toHaveLength(1)
  })

  it('joins a backslash-continued call before scanning it', () => {
    const source = 'gh api \\\n  "repos/x/y?a=1&b=2" \\\n  --jq .id\n'
    expect(shellScriptViolations(source)).toEqual([])
  })

  it('stays silent on the real ci/ready-dedupe.sh artifact-lookup call', () => {
    const source =
      'artifacts_json=$(gh api --method GET ' +
      '"repos/$GITHUB_REPOSITORY/actions/artifacts?name=ci-state-$TESTED_SHA")\n'
    expect(shellScriptViolations(source)).toEqual([])
  })

  it('stays silent on the real ci/ready-dedupe.sh paginated-runs call', () => {
    const source =
      'prior_runs_pages=$(gh api --paginate --slurp --method GET ' +
      '"repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs' +
      '?event=pull_request&head_sha=$HEAD_SHA&per_page=100") &&\n'
    expect(shellScriptViolations(source)).toEqual([])
  })

  it('flags an unquoted `&` inside a `$(...)` substitution even when the substitution is quoted', () => {
    // The .github/workflows/shepherd.yml:82 idiom: `VAR="$(gh api ...)"`. Double quotes around
    // the substitution do not quote what happens inside it — that context has its own,
    // independent quoting — so the unquoted `&` here still backgrounds the inner command.
    const source = 'PR_JSON="$(gh api repos/x/y?a=1&b=2)"\n'
    expect(shellScriptViolations(source)).toHaveLength(1)
  })

  it('stays silent when the URL inside a `$(...)` substitution is itself quoted', () => {
    const source = 'PR_JSON="$(gh api "repos/x/y?a=1&b=2")"\n'
    expect(shellScriptViolations(source)).toEqual([])
  })

  it('stays silent on a nested `$(...)` substitution with a quoted inner URL', () => {
    const source = 'PR_JSON="$(echo "$(gh api "repos/x/y?a=1&b=2")")"\n'
    expect(shellScriptViolations(source)).toEqual([])
  })

  it('reports the correct file line for a workflow run: block violation', () => {
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: |',
      '          gh api repos/x/y?a=1',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([{ line: 6, excerpt: expect.any(String) }])
  })

  it('stays silent on a compliant multi-line workflow run: block', () => {
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: |',
      '          gh api --method GET \\',
      '            "repos/x/y?a=1&b=2" \\',
      '            --jq .id',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([])
  })

  it('reports a violation folded across two source lines of a run: >- block', () => {
    // YAML folding joins these two source lines with a space before the shell ever sees them, so
    // `gh api` and the unquoted query form one unsafe command at runtime even though they sit on
    // separate lines in the file. The reported line is the `run: >-` block's start line, since
    // folding discards the source line breaks a hit's offset would otherwise map back through.
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: >-',
      '          gh api',
      '          repos/x/y?a=1&b=2',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([{ line: 5, excerpt: expect.any(String) }])
  })

  it('stays silent on a compliant run: >- folded block', () => {
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: >-',
      '          gh api',
      '          "repos/x/y?a=1&b=2"',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([])
  })

  it('reports a violation hidden by a single-quoted YAML flow scalar', () => {
    // YAML strips these outer quotes before the shell ever sees the value, so the shell-level
    // argument is bare `repos/x/y?a=1&b=2` even though the source line looks quoted (#10956
    // review). Scanning the raw source slice (which still includes the `'…'` delimiters) would
    // make the shell scanner mistake them for argument quoting and miss this.
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      "        run: 'gh api repos/x/y?a=1&b=2'",
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([{ line: 5, excerpt: expect.any(String) }])
  })

  it('reports a violation hidden by a double-quoted YAML flow scalar', () => {
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: "gh api repos/x/y?a=1&b=2"',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([{ line: 5, excerpt: expect.any(String) }])
  })

  it('stays silent when the shell argument is itself quoted inside a single-quoted YAML flow scalar', () => {
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: \'gh api "repos/x/y?a=1&b=2"\'',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([])
  })

  it('stays silent when the shell argument is itself quoted inside a double-quoted YAML flow scalar', () => {
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: "gh api \'repos/x/y?a=1&b=2\'"',
      '',
    ].join('\n')
    expect(workflowYamlViolations(source)).toEqual([])
  })

  it('throws when a `run:` value is a YAML alias to a string scalar', () => {
    // An aliased `run:` value would otherwise bypass this guard silently, since the current
    // detection only understands Scalar nodes at a `run:` pair — a loud failure is the correct
    // response to an invariant this guard cannot yet enforce (#10956 review).
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: A',
      '        run: &shared |',
      '          gh api "repos/x/y"',
      '      - name: B',
      '        run: *shared',
      '',
    ].join('\n')
    expect(() => workflowYamlViolations(source)).toThrow(/YAML alias/)
  })

  it('throws when a `run:` value is a multiline PLAIN scalar', () => {
    // A PLAIN scalar (no quotes, no `|`/`>` block indicator) can still span multiple source lines —
    // YAML folds the line break into a single space before the shell ever sees it. Scanning the raw
    // source slice instead (as this guard does for single-line PLAIN) leaves an un-joined `\n` with
    // no trailing backslash, so the scanner treats the continuation as an unrelated logical line and
    // silently misses a `gh api` call split across the fold — a loud failure is the correct response
    // until multiline PLAIN decoding is added (#10956 review).
    const source = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Query',
      '        run: gh api',
      '          repos/x/y?a=1&b=2',
      '',
    ].join('\n')
    expect(() => workflowYamlViolations(source)).toThrow(/multiline PLAIN/)
  })

  it('recognizes the one tracked extensionless shell entrypoint under ci/', () => {
    expect(isGhApiShellScriptFile('ci/with-node-test-options')).toBe(true)
  })

  it('does not recognize an arbitrary extensionless path under ci/', () => {
    expect(isGhApiShellScriptFile('ci/not-a-real-script')).toBe(false)
  })

  it('has no unquoted `?`/`&` in a gh api argument across tracked workflows and scripts', () => {
    const files = allTrackedFiles()
    const workflowFiles = files.filter(isGhApiWorkflowFile)
    const shellFiles = files.filter(isGhApiShellScriptFile)
    expect(workflowFiles.length).toBeGreaterThan(0)
    expect(shellFiles.length).toBeGreaterThan(0)

    const violations = [
      ...workflowFiles.flatMap(path =>
        workflowYamlViolations(readFileSync(resolve(root, path), 'utf8')).map(v => ({
          ...v,
          file: path,
        })),
      ),
      ...shellFiles.flatMap(path =>
        shellScriptViolations(readFileSync(resolve(root, path), 'utf8')).map(v => ({
          ...v,
          file: path,
        })),
      ),
    ]
    expect(violations).toEqual([])
  })
})
