import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'
import { areaCoverageRules } from '../ci/coverage-area-rules.mts'
import { VITEST_OWNERSHIP } from '../ci/vitest/project-ownership.mts'
import {
  type AreaWorkflow,
  impactedCoverageAreas,
  type LocalCoverageRules,
  localCoverageProjects,
} from './impacted-coverage-plan.mts'

function run(command: string, args: string[], env: NodeJS.ProcessEnv, capture = false): string {
  const child = spawnSync(command, args, {
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (child.error || child.signal || child.status !== 0) {
    if (capture) process.stderr.write(`${child.stdout ?? ''}${child.stderr ?? ''}`)
    throw new Error(
      `${command} ${args.join(' ')}: ${child.error?.message ?? child.signal ?? `exit ${String(child.status)}`}`,
    )
  }
  return child.stdout ?? ''
}

function main(): void {
  const paths = process.argv.slice(2)
  if (paths.length === 0)
    throw new Error('patch-coverage selection is missing changed path arguments')
  const config = parse(readFileSync('.coverage-rules.yml', 'utf8')) as LocalCoverageRules
  const areas = impactedCoverageAreas(paths, config)
  if (areas.length === 0) return
  const base = process.env.IMPACTED_CHECKS_BASE
  if (!base) throw new Error('patch-coverage requires IMPACTED_CHECKS_BASE from impacted-checks')
  // WORKTREE includes unstaged/index changes. Git cannot include untracked files in this diff,
  // so require those files to be staged before accepting patch-coverage evidence.
  const untracked = run(
    'git',
    ['ls-files', '--others', '--exclude-standard', '-z'],
    process.env,
    true,
  )
    .split('\0')
    .filter(path => paths.includes(path))
  if (untracked.length > 0) {
    throw new Error(`patch-coverage: stage new selected files first: ${untracked.join(', ')}`)
  }
  const temporary = mkdtempSync(join(tmpdir(), 'voucha-patch-coverage-'))
  try {
    const scope = join(temporary, 'scope.json')
    run('node', ['ci/write-coverage-scope.mts', scope], process.env)
    run(
      'pnpm',
      [
        'exec',
        'vouchington',
        'coverage-scope-check',
        '--rules',
        '.coverage-rules.yml',
        '--scope-file',
        scope,
      ],
      process.env,
    )
    for (const area of areas) {
      const workflow = parse(readFileSync(`.github/workflows/${area}.yml`, 'utf8')) as AreaWorkflow
      const { projects, additionalProducers } = localCoverageProjects(workflow, VITEST_OWNERSHIP)
      const artifacts = join(temporary, area)
      const env = {
        ...process.env,
        VITEST_COVERAGE_ENABLED: 'true',
        STORYBOOK_BROWSER_COVERAGE: '1',
        STORYBOOK_BROWSER_STARTUP_ATTEMPTS: '1',
      }
      process.stdout.write(
        `patch-coverage ${area}: running ${projects.length} full projects with fresh LCOV; ` +
          'this can take tens of minutes and requires the owning suites’ local services.\n',
      )
      if (additionalProducers.length > 0) {
        process.stdout.write(
          `Additional CI coverage producers not registered as Vitest projects: ${additionalProducers.join(', ')}. ` +
            'Their native coverage is not reused locally; any local patch shortfall still fails.\n',
        )
      }
      // Sequential producers keep both database access and the coverage output isolated.
      for (const project of projects) {
        const output = join(artifacts, project.project.replaceAll('/', '-'))
        const args = [
          'exec',
          './ci/with-node-test-options',
          'vitest',
          'run',
          '--bail=3',
          '--project',
          project.project,
          '--coverage',
          '--coverage.reporter=lcov',
          `--coverage.reportsDirectory=${output}`,
        ]
        if (project.browserRunner) {
          run(
            'pnpm',
            [
              'exec',
              'vouchington',
              'storybook-browser-runner',
              '--project',
              project.project,
              '--result-file',
              join(output, 'lcov.info'),
              '--completion-file',
              join(output, 'lcov.info'),
              '--optimize-deps-config',
              'test-helpers/vitest-config/storybook-browser-optimize-deps.mts',
              '--',
              ...args,
            ],
            env,
          )
        } else {
          run('pnpm', args, env)
        }
        if (!existsSync(join(output, 'lcov.info'))) {
          throw new Error(`patch-coverage ${area}: ${project.project} produced no fresh LCOV`)
        }
      }
      const rules = join(temporary, `${area}-rules.yml`)
      writeFileSync(rules, stringify(areaCoverageRules(config, area)))
      // Scope-aware coverage-check rejects missing files as well as uncovered changed lines.
      // Native CI producers may add coverage; a local shortfall remains a failure, never a skip.
      run(
        'pnpm',
        [
          'exec',
          'coverage-check',
          'check',
          '--rules',
          rules,
          '--artifacts',
          artifacts,
          '--aggregate-artifacts',
          '--fail-on-empty',
          '--base',
          base,
          '--head',
          'WORKTREE',
          '--suite',
          area,
        ],
        env,
      )
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

try {
  main()
} catch (err) {
  console.error(`patch-coverage failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
}
