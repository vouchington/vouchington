import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  postRouteConfigSource,
  postRouteConfigs,
  postTypeUnionSource,
  publicPostSlugMap,
  topicRouteConfigSource,
  topicTypesSource,
} from './repo-file-policy-test-sources.mts'
import { afterEach } from 'vitest'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { checkRepoFilePolicy } from './index.mts'
import {
  type ModerationDocsOverrides,
  trackModerationDocs,
} from './moderation-policy-test-fixtures.mts'
import { emptySchemaSnapshot, partitionedSnapshotTable } from './schema-snapshot-test-fixtures.mts'
import {
  type LifecycleScenarioFixture,
  writeValidLifecycleScenarioFixture,
} from './lifecycle-scenario-test-fixtures.mts'
import { writeValidLocalLlmEndpointPolicyFixture } from './local-llm-endpoint-policy-test-fixtures.mts'
export { mkdir, rm, writeFile } from 'node:fs/promises'
export { join } from 'node:path'
export { checkRepoFilePolicy } from './index.mts'
export { parseTopicTypeEntries } from './finite-enum-ripple-parsers.mts'
// Kept here (not just in repo-file-policy-test-sources.mts) so every existing consumer's
// import path stays unchanged; the constant itself moved to stay under this file's line cap.
export { SYNCED_MODERATION_POLICY_MATRIX_DOC } from './repo-file-policy-test-sources.mts'

export function setupRepoFilePolicyTest() {
  const testDirs: string[] = []
  const trackedFilesByRepo = new Map<string, Set<string>>()
  const snapshotTablesByRepo = new Map<string, Record<string, unknown>>()

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepo({
    lifecycleScenarioContract = 'valid',
  }: { lifecycleScenarioContract?: LifecycleScenarioFixture } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-repo-file-policy-'))
    testDirs.push(dir)
    trackedFilesByRepo.set(dir, new Set())
    snapshotTablesByRepo.set(dir, {})
    if (lifecycleScenarioContract === 'valid') {
      await writeValidLifecycleScenarioFixture((path, content) => track(dir, path, content))
    } else if (lifecycleScenarioContract === 'untracked') {
      await writeValidLifecycleScenarioFixture(async (path, content) => {
        await mkdir(dirname(join(dir, path)), { recursive: true })
        await writeFile(join(dir, path), content)
      })
    }
    await writeValidLocalLlmEndpointPolicyFixture((path, content) => track(dir, path, content))
    return dir
  }

  async function track(repoRoot: string, path: string, content: string) {
    await mkdir(dirname(join(repoRoot, path)), { recursive: true })
    await writeFile(join(repoRoot, path), content)
    trackPath(repoRoot, path)
    if (/\bPARTITION\s+BY\b/i.test(content)) {
      for (const match of content.matchAll(
        /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?\w+"?\.)?"?([a-z][a-z0-9_]*)"?/gi,
      )) {
        snapshotTablesByRepo.get(repoRoot)![match[1]] = partitionedSnapshotTable()
      }
    }
  }

  function trackPath(repoRoot: string, path: string) {
    trackedFilesByRepo.get(repoRoot)?.add(path)
  }

  const trackSyncedModerationDocs = (
    repoRoot: string,
    overrides?: ModerationDocsOverrides,
  ): Promise<void> => trackModerationDocs(repoRoot, track, overrides)

  async function trackTopicEnumSurfaces(
    repoRoot: string,
    options: {
      backend: Record<string, string>
      web?: Record<string, string>
      routes?: string[]
    },
  ) {
    await track(
      repoRoot,
      'backend/types/entities/topic.mts',
      topicTypesSource(options.backend, true),
    )
    await track(
      repoRoot,
      'web/types/topics.ts',
      topicTypesSource(options.web ?? options.backend, true),
    )
    for (const slug of options.routes ?? Object.values(options.backend)) {
      await track(
        repoRoot,
        `web/app/(topics)/${slug}/[id]/page.tsx`,
        `const { default: Page } = createTopicRootPage('${slug}')\nexport default Page\n`,
      )
    }
  }

  async function trackPostEnumSurfaces(
    repoRoot: string,
    options: {
      postTypes: string[]
      routeConfig?: Record<string, string>
      routes?: string[]
      collectionRoutes?: string[]
    },
  ) {
    await track(repoRoot, 'backend/types/entities/post.mts', postTypeUnionSource(options.postTypes))
    await track(
      repoRoot,
      'web/lib/route-configs.ts',
      postRouteConfigSource(options.routeConfig ?? publicPostSlugMap(options.postTypes)),
    )
    const routeConfig = options.routeConfig ?? publicPostSlugMap(options.postTypes)
    for (const slug of options.routes ?? Object.keys(publicPostSlugMap(options.postTypes))) {
      const postType = routeConfig[slug] ?? slug
      await track(
        repoRoot,
        `web/app/(posts)/${slug}/[id]/page.tsx`,
        `import { createPostDetailPage } from '@/lib/routes/post-route-factories'\nconst { default: Page } = createPostDetailPage('${postType}', '${slug}')\nexport default Page\n`,
      )
    }
    for (const slug of options.collectionRoutes ?? Object.keys(postRouteConfigs(routeConfig))) {
      await track(repoRoot, `web/app/(posts)/${slug}/page.tsx`, 'export default {}\n')
    }
  }

  async function run(repoRoot: string): Promise<{ stdout: string }> {
    const trackedFiles = [...(trackedFilesByRepo.get(repoRoot) ?? [])]
    const ctx: SharedContext = {
      repoRoot,
      isInsideGitRepo: true,
      trackedFiles,
      trackedFileSet: new Set(trackedFiles),
    }
    const result = await checkRepoFilePolicy(ctx, {
      schemaSnapshot: emptySchemaSnapshot(snapshotTablesByRepo.get(repoRoot) ?? {}),
    })
    if (result.errors.length > 0) {
      const stdout = result.errors.join('\n')
      // ast-grep-ignore: no-object-assign-new-error -- test helper attaches scan stdout onto a thrown Error
      const err = Object.assign(new Error('repo-file-policy check failed'), { code: 1, stdout })
      throw err
    }
    return { stdout: 'All checks passed.' }
  }

  return {
    makeRepo,
    run,
    topicRouteConfigSource,
    track,
    trackPath,
    trackPostEnumSurfaces,
    trackSyncedModerationDocs,
    trackTopicEnumSurfaces,
  }
}
