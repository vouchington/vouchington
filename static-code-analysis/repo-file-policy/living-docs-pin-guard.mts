import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type LivingDocsPinCase = {
  readonly path: string
  readonly patterns: readonly RegExp[]
}

export const LIVING_DOCS_PIN_CASES: readonly LivingDocsPinCase[] = [
  {
    path: 'docs/development/reference-dependency-updates-manually-maintained-pins.md',
    patterns: [
      /Current (?:SHA|commit|digest)|Active revision/iu,
      /\|[\t ]*\x60?[0-9a-f]{7,40}\x60?[\t ]*\|/u,
      /[0-9a-f]{64}/u,
    ],
  },
  {
    path: 'docs/development/system-dependencies.md',
    patterns: [/build-tools;\d+\.\d+\.\d+/u],
  },
  {
    path: 'docs/development/code-statistics.md',
    patterns: [/update the `go install` command in/u],
  },
  {
    path: '.agents/skills/agent-workflow/implementation.md',
    patterns: [/tool version pin in `\.mise\.toml`, update the corresponding doc/u],
  },
]

const PIN_POLICY =
  'living docs must not copy package pins; point at the owner file (docs/development/dependency-updates.md#docs-pinning-policy)'

export const DOCS_PINNING_POLICY_PATH = 'docs/development/dependency-updates.md'

export function livingDocsPinDiagnostics(path: string, content: string): string[] {
  const patterns = LIVING_DOCS_PIN_CASES.find(entry => entry.path === path)?.patterns
  if (!patterns) return []
  const errors: string[] = []
  for (const pattern of patterns) {
    const match = pattern.exec(content)
    if (match) {
      errors.push(
        `::error file=${path}::${path}: ${PIN_POLICY} (found ${JSON.stringify(match[0])})`,
      )
    }
  }
  return errors
}

export function checkLivingDocsPinGuard(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  const tracked = new Set(trackedFiles)
  if (tracked.has(DOCS_PINNING_POLICY_PATH)) {
    for (const { path } of LIVING_DOCS_PIN_CASES) {
      if (tracked.has(path)) continue
      errors.push(`::error file=${path}::${path}: living-docs pin policy page is not tracked`)
    }
  }
  for (const { path } of LIVING_DOCS_PIN_CASES) {
    if (!tracked.has(path)) continue
    const absolute = join(repoRoot, path)
    if (!existsSync(absolute)) {
      errors.push(`::error file=${path}::${path}: living-docs pin policy page is missing on disk`)
      continue
    }
    errors.push(...livingDocsPinDiagnostics(path, readFileSync(absolute, 'utf8')))
  }
}
