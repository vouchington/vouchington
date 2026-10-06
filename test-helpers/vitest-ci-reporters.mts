import path, { relative } from 'node:path'
import type { InlineConfig } from 'vitest/node'
import { createVitestFileProgressReporter } from './vitest-file-progress-reporter.mts'
import { createVitestTeardownOverrunReporter } from './vitest-teardown-overrun-reporter.mts'
import { createVitestStorybookProgressReporter } from './vitest-storybook-progress-reporter.mts'

type VitestReporters = NonNullable<InlineConfig['reporters']>
type VitestReporter = Extract<VitestReporters, readonly unknown[]>[number]
type VitestOutputFile = NonNullable<InlineConfig['outputFile']>

export function normalizeGithubActionsPath(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const roots = [process.env.GITHUB_WORKSPACE, process.cwd()].filter((root): root is string =>
    Boolean(root),
  )
  for (const root of roots) {
    const normalizedRoot = root.replace(/\\/g, '/')
    const relativePath = path.isAbsolute(normalizedPath)
      ? relative(normalizedRoot, normalizedPath)
      : normalizedPath
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      return relativePath.replace(/\\/g, '/')
    }
  }
  if (path.isAbsolute(normalizedPath)) return normalizedPath
  return normalizedPath.replace(/^\.\//, '')
}

function githubActionsReporter(): VitestReporter {
  return [
    'github-actions',
    {
      onWritePath: normalizeGithubActionsPath,
      jobSummary: {
        enabled: false,
        fileLinks: {
          repository: process.env.GITHUB_REPOSITORY,
          commitHash: process.env.GITHUB_SHA,
          workspacePath: process.env.GITHUB_WORKSPACE,
        },
      },
    },
  ]
}

export function ciReporters(): VitestReporters | undefined {
  switch (process.env.VITEST_CI_REPORTERS) {
    case undefined:
    case '':
      return undefined
    case 'run':
      return [
        'minimal',
        ...(process.env.VITEST_STORYBOOK_BROWSER === '1'
          ? [createVitestStorybookProgressReporter()]
          : []),
        githubActionsReporter(),
        'junit',
        'hanging-process',
        createVitestTeardownOverrunReporter(),
        ...(process.env.VITEST_FILE_PROGRESS === '1' ? [createVitestFileProgressReporter()] : []),
      ]
    default:
      throw new Error(
        `Unknown VITEST_CI_REPORTERS value "${process.env.VITEST_CI_REPORTERS}". Accepted value: run.`,
      )
  }
}

export function ciOutputFile(): VitestOutputFile | undefined {
  const outputFile: Record<string, string> = {}
  if (process.env.VITEST_JUNIT_OUTPUT_FILE) outputFile.junit = process.env.VITEST_JUNIT_OUTPUT_FILE
  return Object.keys(outputFile).length === 0 ? undefined : outputFile
}
