export const LIFECYCLE_FAMILY_CONSUMERS = {
  'moderation-appeal-lifecycle': ['backend', 'web', 'swift', 'dotnet'],
  'integrity-authoritative-read': ['backend'],
  'integrity-ambiguous-reconciliation': ['web', 'swift', 'dotnet'],
  'forward-pagination': ['web', 'swift', 'dotnet'],
  'forward-pagination-cancellation': ['swift', 'dotnet'],
  'private-post-collection-backend': ['backend'],
  'private-post-collection-browser': ['web'],
} as const

export type LifecycleConsumer = 'backend' | 'web' | 'swift' | 'dotnet'
export type LifecycleFamily = keyof typeof LIFECYCLE_FAMILY_CONSUMERS

type LifecycleAdapter = {
  consumer: LifecycleConsumer
  families: readonly LifecycleFamily[]
  evidence: {
    manifest: string
    dispatch: string
  }
}

const BACKEND_EVIDENCE = {
  manifest: 'backend/test-helpers/lifecycle-scenarios.mts',
  dispatch: 'backend/data-stores/psql/__tests__/lifecycle-scenarios.test.mts',
} as const
const WEB_EVIDENCE = {
  manifest: 'web/lib/lifecycle-scenarios/manifest.ts',
  dispatch: 'web/lib/lifecycle-scenarios/adapters.ts',
} as const
export const LIFECYCLE_ADAPTERS = {
  'backend-moderation-appeal-service': {
    consumer: 'backend',
    families: ['moderation-appeal-lifecycle'],
    evidence: BACKEND_EVIDENCE,
  },
  'web-moderation-appeal-actions': {
    consumer: 'web',
    families: ['moderation-appeal-lifecycle'],
    evidence: WEB_EVIDENCE,
  },
  'backend-integrity-authority': {
    consumer: 'backend',
    families: ['integrity-authoritative-read'],
    evidence: BACKEND_EVIDENCE,
  },
  'web-integrity-reconciliation': {
    consumer: 'web',
    families: ['integrity-ambiguous-reconciliation'],
    evidence: WEB_EVIDENCE,
  },
  'web-forward-pagination': {
    consumer: 'web',
    families: ['forward-pagination'],
    evidence: WEB_EVIDENCE,
  },
  'backend-private-post-collection': {
    consumer: 'backend',
    families: ['private-post-collection-backend'],
    evidence: BACKEND_EVIDENCE,
  },
  'web-playwright-private-post-collection': {
    consumer: 'web',
    families: ['private-post-collection-browser'],
    evidence: {
      manifest: 'playwright/helpers/lifecycle-scenario-manifest.mts',
      dispatch: 'playwright/tests/my/saved-posts-lifecycle-contract.spec.mts',
    },
  },
} as const satisfies Record<string, LifecycleAdapter>
