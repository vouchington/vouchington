import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type PackageManifest = { scripts?: Record<string, string> }

// Recognizes every pnpm invocation shape actually used in this repo's own package.json scripts
// (grep `pnpm --dir` / `pnpm run` there for the live idioms): `pnpm run <script>`, `pnpm <script>`
// (the "run" keyword is optional), and both forms again with an inline `pnpm --dir <path> ...`
// instead of relying on the step's `working-directory`. A step invoking `pnpm exec ...` or any
// form with trailing arguments after the script name never matches — `$` anchors the whole
// trimmed command to end right after the script token (@chatgpt-codex-connector, PR #11084).
const pnpmInvocationPattern = /^pnpm(?:\s+--dir\s+(?<dir>\S+))?(?:\s+run)?\s+(?<script>[\w:-]+)$/

export function parsePnpmInvocation(
  command: string,
  dir: string,
): { dir: string; script: string } | null {
  const match = pnpmInvocationPattern.exec(command.trim())
  if (!match?.groups) return null
  return {
    dir: match.groups.dir === undefined ? dir : join(dir, match.groups.dir),
    script: match.groups.script,
  }
}

// A package.json script is lock-owning if it invokes with-build-lock.sh directly, or if it just
// forwards to another package's script that (recursively) does — e.g. root package.json's
// `build:storybook` is `pnpm --dir web run build-storybook`, which is web/package.json's own
// with-build-lock-wrapped script. `visited` guards against a cycle turning this into an infinite
// recursion (@chatgpt-codex-connector, PR #11084: "or through a root forwarding script").
export function isLockOwningScript(
  dir: string,
  scriptName: string,
  visited = new Set<string>(),
): boolean {
  const key = `${dir}#${scriptName}`
  if (visited.has(key)) return false
  visited.add(key)

  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageManifest
  const script = manifest.scripts?.[scriptName]
  if (script === undefined) return false
  if (script.includes('with-build-lock')) return true

  const forwarded = parsePnpmInvocation(script, dir)
  return forwarded !== null && isLockOwningScript(forwarded.dir, forwarded.script, visited)
}

// Resolves a `run:` step's package-script indirection to whatever manifest actually owns it,
// rather than hand-naming scripts — so a newly lock-wrapped script (or one that stops being
// lock-wrapped, e.g. build-storybook today) is picked up without editing this file. Shared by both
// the workflow-job scan and the composite-action scan in build-lock-timeouts.test.mts: a composite
// action's `run:` step resolves relative to the repo root the same way a workflow job step does.
//
// `inheritedWorkingDirectory` carries a job- or workflow-level `defaults.run.working-directory`
// that the step itself doesn't repeat (@chatgpt-codex-connector, PR #11084) — a step's own
// `working-directory` always wins when present. Composite actions have no `defaults` key in the
// GitHub Actions schema, so their steps only ever pass the default `'.'`.
export function isPackageScriptBuildLockStep(
  step: { run?: string; 'working-directory'?: string },
  inheritedWorkingDirectory = '.',
): boolean {
  if (step.run === undefined) return false
  const invocation = parsePnpmInvocation(
    step.run,
    step['working-directory'] ?? inheritedWorkingDirectory,
  )
  return invocation !== null && isLockOwningScript(invocation.dir, invocation.script)
}
