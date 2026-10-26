interface KnipWorkspaceConfig {
  ignoreDependencies?: string[]
}

export interface KnipConfig {
  ignoreDependencies?: string[]
  workspaces?: Record<string, KnipWorkspaceConfig>
}

export interface IgnoredDependencyEvidence {
  dependency: string
  evidenceFiles: readonly string[]
  evidencePattern: RegExp
}

export const PHANTOM_REFERENCE_FILE_NAME = 'knip-dependency-references.d.ts'

/** Only documented edges outside Knip's static package graph may be ignored. */
export const allowedWorkspaceIgnoreDependencies = new Map<
  string,
  readonly IgnoredDependencyEvidence[]
>([
  [
    'backend/api',
    [
      {
        dependency: '@services/classifier-runs',
        evidenceFiles: ['backend/workers/ai-agents/processors/classifier-run-handler.mts'],
        evidencePattern: /\bfrom '@services\/classifier-runs'/,
      },
      {
        dependency: '@services/entity-listener-reconciliation',
        evidenceFiles: ['backend/workers/entity-listeners/processors/reconciliation.mts'],
        evidencePattern: /\bfrom '@services\/entity-listener-reconciliation'/,
      },
      {
        dependency: '@services/post-classifier',
        evidenceFiles: ['backend/workers/ai-agents/processors/classifier-run-post-classifier.mts'],
        evidencePattern: /\bfrom '@services\/post-classifier'/,
      },
    ],
  ],
  [
    'backend/entrypoints/api',
    [
      {
        dependency: '@modules/bluesky-oauth',
        evidenceFiles: ['backend/api/bluesky/client-metadata.mts'],
        evidencePattern: /\bfrom '@modules\/bluesky-oauth'/,
      },
      {
        dependency: '@services/bluesky-accounts',
        evidenceFiles: ['backend/api/v1/sessions-authentication/auth-bluesky.mts'],
        evidencePattern: /\bfrom '@services\/bluesky-accounts'/,
      },
      {
        dependency: '@services/bluesky-follows',
        evidenceFiles: ['backend/api/v1/sessions-authentication/auth-bluesky.mts'],
        evidencePattern: /\bfrom '@services\/bluesky-follows'/,
      },
      {
        dependency: '@services/classifier-runs',
        evidenceFiles: ['backend/workers/ai-agents/processors/classifier-run-handler.mts'],
        evidencePattern: /\bfrom '@services\/classifier-runs'/,
      },
      {
        dependency: '@services/entity-listener-reconciliation',
        evidenceFiles: ['backend/workers/entity-listeners/processors/reconciliation.mts'],
        evidencePattern: /\bfrom '@services\/entity-listener-reconciliation'/,
      },
      {
        dependency: '@services/entity-relation-actions',
        evidenceFiles: ['backend/api/v1/entity-relations/entity-relations.mts'],
        evidencePattern: /\bfrom '@services\/entity-relation-actions'/,
      },
      {
        dependency: '@services/post-classifier',
        evidenceFiles: ['backend/workers/ai-agents/processors/classifier-run-post-classifier.mts'],
        evidencePattern: /\bfrom '@services\/post-classifier'/,
      },
    ],
  ],
  [
    'ci',
    [
      {
        dependency: 'coverage-check',
        evidenceFiles: ['.github/workflows/tests-backend-unit.yml'],
        evidencePattern: /\.\/ci\/node_modules\/\.bin\/coverage-check\b/,
      },
    ],
  ],
  [
    'cloudflare-worker',
    [
      {
        dependency: 'cloudflare',
        evidenceFiles: [
          'cloudflare-worker/src/cached-origin.mts',
          'cloudflare-worker/src/types.mts',
        ],
        evidencePattern: /\bfrom 'cloudflare:workers'/,
      },
    ],
  ],
  [
    'lambdas/image-resize',
    [
      {
        dependency: '@fontsource/inter',
        evidenceFiles: ['lambdas/image-resize/og/fonts.mts'],
        evidencePattern: /nodeRequire\.resolve\(`@fontsource\/inter/,
      },
      {
        dependency: '@types/react',
        evidenceFiles: ['lambdas/image-resize/og/render.mts'],
        evidencePattern: /@types\/react/,
      },
    ],
  ],
])

export function ignoredDependencyImportPattern(dependency: string): RegExp {
  const dependencyPattern = RegExp.escape(dependency)
  return new RegExp(
    String.raw`(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]${dependencyPattern}(?:\/[^'"]*)?['"]`,
  )
}
