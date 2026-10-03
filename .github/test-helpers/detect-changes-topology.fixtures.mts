import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { parse as load } from 'yaml'

import { parseGithubOutput } from './github-output.mts'
import { requiredNamedStep, requiredStepRun, type WorkflowJob } from './workflow-fixtures.mts'

export type Files = Record<string, string>

// Hosted PR events (including every layer of a native stack) report the stack base here.
const HOSTED_PR_ENV = { EVENT_NAME: 'pull_request', PR_BASE_REF: 'main', GITHUB_BASE_REF: 'main' }

function gitEnvironment(): NodeJS.ProcessEnv {
  // Hooks export GIT_DIR and friends; a synthetic repository must not inherit them.
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
}

export function detectChangesJob(): WorkflowJob & { steps: NonNullable<WorkflowJob['steps']> } {
  const workflow = load(readFileSync('.github/workflows/ci-detect-changes.yml', 'utf8')) as {
    jobs: Record<string, WorkflowJob & { steps: NonNullable<WorkflowJob['steps']> }>
  }
  return workflow.jobs['detect-changes']!
}

// A synthetic repository of explicit commits. Nothing here uses a real SHA or a real ref.
export class TopologyRepo {
  readonly directory = mkdtempSync(join(tmpdir(), 'detect-changes-topology-'))
  readonly root: string
  private outputs = 0

  constructor(rootFiles: Files) {
    this.git('init', '-q', '-b', 'main')
    this.git('config', 'user.name', 'CI Test')
    this.git('config', 'user.email', 'ci-test@example.invalid')
    this.git('config', 'commit.gpgsign', 'false')
    this.root = this.commitOn(undefined, rootFiles, 'root')
  }

  git(...args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.directory,
      encoding: 'utf8',
      env: gitEnvironment(),
    }).trim()
  }

  commitOn(parent: string | undefined, files: Files, message: string): string {
    if (parent) this.git('checkout', '-q', '--detach', parent)
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(this.directory, path)), { recursive: true })
      writeFileSync(join(this.directory, path), content)
    }
    this.git('add', '-A')
    this.git('commit', '-q', '-m', message)
    return this.git('rev-parse', 'HEAD')
  }

  // GitHub's test merge: first parent is the base side, second parent is the head side.
  merge(firstParent: string, secondParent: string): string {
    this.git('checkout', '-q', '--detach', firstParent)
    this.git('merge', '-q', '--no-ff', '-m', 'test merge', secondParent)
    if (this.git('rev-parse', 'HEAD^1') !== firstParent) throw new Error('first parent mismatch')
    if (this.git('rev-parse', 'HEAD^2') !== secondParent) throw new Error('second parent mismatch')
    return this.git('rev-parse', 'HEAD')
  }

  // The workflow compares against origin/main, which actions fetch by name.
  checkout(mergeRef: string, originMain: string): void {
    this.git('update-ref', 'refs/remotes/origin/main', originMain)
    this.git('checkout', '-q', '--detach', mergeRef)
  }

  // Native stack, as hosted runs observe it: layer heads are chained, each layer's test merge has
  // the layer below's test merge (or the base) as first parent, and the layer head as second.
  stack(base: string, lower: Files, upper: Files) {
    const lowerHead = this.commitOn(base, lower, 'lower layer')
    const lowerTestMerge = this.merge(base, lowerHead)
    const upperHead = this.commitOn(lowerHead, upper, 'upper layer')
    const mergeRef = this.merge(lowerTestMerge, upperHead)
    this.checkout(mergeRef, base)
    return { base, lowerHead, lowerTestMerge, upperHead, mergeRef }
  }

  changed(range: string): string[] {
    return this.git('diff', '--name-only', range).split('\n').filter(Boolean)
  }

  runStep(name: string, env: Record<string, string>): Record<string, string> {
    const output = join(this.directory, '.git', `step-output-${this.outputs++}`)
    writeFileSync(output, '')
    execFileSync(
      'bash',
      ['-e', '-c', requiredStepRun(requiredNamedStep(detectChangesJob(), name))],
      {
        cwd: this.directory,
        env: { ...gitEnvironment(), ...env, GITHUB_OUTPUT: output },
      },
    )
    return parseGithubOutput(readFileSync(output, 'utf8'))
  }

  docsOnly(env: Record<string, string> = HOSTED_PR_ENV): string | undefined {
    return this.runStep('Check for docs-only changes', env)['docs-only']
  }

  // A merge group's pinned range feeds both the docs-only check and the path filters.
  mergeGroupDocsOnly(): string | undefined {
    const range = this.runStep('Resolve merge queue diff range', {})
    return this.docsOnly({
      EVENT_NAME: 'merge_group',
      MERGE_QUEUE_BASE_SHA: range['base']!,
      MERGE_QUEUE_HEAD_SHA: range['head']!,
    })
  }

  dispose(): void {
    rmSync(this.directory, { recursive: true, force: true })
  }
}
