import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

function normalizedMarkdown(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8').replace(/\s+/g, ' ').trim()
}

describe('agent workflow batching documentation', () => {
  it('keeps verbose no-mistakes results in private artifacts and reports bounded outcomes', () => {
    const impactDiscovery = normalizedMarkdown(
      '.agents/skills/planning/references/impact-discovery.md',
    )

    expect(impactDiscovery).toContain('`umask 077`')
    expect(impactDiscovery).toContain('`chmod 700 "$impact_dir"`')
    expect(impactDiscovery).toContain('`<name>.json`, `<name>.stderr`, and `<name>.status`')
    expect(impactDiscovery).toContain('`--plan "$impact_dir/plan.json"`')
    expect(impactDiscovery).toContain('if ! impact_dir="$(mktemp -d')
    expect(impactDiscovery).toContain('if ! chmod 700 "$impact_dir"; then')
    expect(impactDiscovery).toContain('Private impact directory setup failed')
    expect(impactDiscovery).toContain('pnpm exec no-mistakes planning-impact')
    expect(impactDiscovery).toContain('--changed-files "$impact_dir/changed-files.txt"')
    expect(impactDiscovery).toContain('--output-dir "$impact_dir"')
    expect(impactDiscovery).toContain('>"$impact_dir/why.json" 2>"$impact_dir/why.stderr"')
    expect(impactDiscovery).toContain('>"$impact_dir/why.status"')
    expect(impactDiscovery).toContain('case "$impact_dir" in')
    expect(impactDiscovery).toContain(
      '"$impact_parent"/no-mistakes-impact.[[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]])',
    )
    expect(impactDiscovery).not.toContain('no-mistakes-impact.??????)')
    expect(impactDiscovery).toContain('rm -rf -- "$impact_dir"')
    expect(impactDiscovery).toContain('Refusing to remove unexpected impact directory')

    for (const artifactContract of [
      '| Dependencies, depth 1 | `dependencies.json` | `dependencies.stderr` | `dependencies.status` |',
      '| Dependents, depth 1 | `dependents.json` | `dependents.stderr` | `dependents.status` |',
      '| Symbols | `symbols.json` | `symbols.stderr` | `symbols.status` |',
      '| Vitest test plan | `plan.json` | `plan.stderr` | `plan.status` |',
      '| Vitest test explanation | `why.json` | `why.stderr` | `why.status` |',
      '| Optional full dependencies | `dependencies-full.json` | `dependencies-full.stderr` | `dependencies-full.status` |',
      '| Optional full dependents | `dependents-full.json` | `dependents-full.stderr` | `dependents-full.status` |',
    ]) {
      expect(impactDiscovery).toContain(artifactContract)
    }
  })

  it('requires one prepared analysis session for compatible no-mistakes reports', () => {
    const start = normalizedMarkdown('.agents/skills/planning/references/impact-discovery.md')

    expect(start).toContain('`--broad`')
    expect(start).toContain(
      'pnpm exec no-mistakes tests why <test-file> --plan "$impact_dir/plan.json" --format json',
    )
    expect(start).toContain('if (!source.trim()) throw new Error("why.json is empty")')
    expect(start).toContain('JSON.parse(source)')
  })

  it('keeps no-mistakes examples batched and validation on full area suites', () => {
    const impactRecipes = normalizedMarkdown('.agents/skills/agent-workflow/impact-recipes.md')
    const packageLegalityStart = impactRecipes.indexOf('## Proposed Import And Package Legality')
    const packageLegalityEnd = impactRecipes.indexOf('## Queue And Worker Impact')
    expect(packageLegalityStart).not.toBe(-1)
    expect(packageLegalityEnd).not.toBe(-1)
    const packageLegality = impactRecipes.slice(packageLegalityStart, packageLegalityEnd)
    const web = normalizedMarkdown('web/CLAUDE.md')
    const tests = normalizedMarkdown('docs/development/tests.md')
    const e2eAndVisual = normalizedMarkdown('docs/development/reference-tests-e2e-and-visual.md')
    const commit = normalizedMarkdown('docs/checklists/commit.md')
    const firstPush = normalizedMarkdown(
      'docs/development/reference-tests-first-push-deterministic-preflight.md',
    )
    const nativeClients = normalizedMarkdown('docs/overview/architecture/native-clients.md')

    const fullSuites = 'pnpm exec vitest run --project <project-a> --project <project-b>'
    expect(impactRecipes).toContain('dependencies <source-file-a> <source-file-b> --format paths')
    expect(impactRecipes).toContain('dependents <source-file-a> <source-file-b> --format paths')
    expect(impactRecipes).toContain(fullSuites)
    expect(impactRecipes).not.toContain('tests plan vitest')
    expect(packageLegality).toContain('resolve-check <source-file> --format human')
    expect(packageLegality).toContain('dependencies <source-file-a> <source-file-b> --format paths')
    expect(packageLegality).toContain(fullSuites)
    expect(packageLegality).not.toContain('dependencies <source-file> --format paths')
    expect(web).toContain(
      '[canonical before-push recipe](../docs/checklists/commit.md#before-pushing)',
    )
    expect(web).not.toContain('pnpm exec no-mistakes tests plan vitest')
    expect(tests).toContain('[E2E and Visual](reference-tests-e2e-and-visual.md)')
    expect(e2eAndVisual).toContain('`pnpm run test:playwright`')
    expect(e2eAndVisual).toContain('[area test suites](ci.md#area-test-suites)')
    expect(e2eAndVisual).not.toContain('tests plan playwright')
    expect(commit).toContain(fullSuites)
    expect(commit).toContain('[area test suites](../development/ci.md#area-test-suites)')
    expect(commit).not.toContain('tests plan')
    expect(firstPush).not.toContain('tests plan swift')
    expect(firstPush).not.toContain('tests plan dotnet')
    expect(nativeClients).toContain('https://github.com/vouchington/vouchington-clients')
  })
})
