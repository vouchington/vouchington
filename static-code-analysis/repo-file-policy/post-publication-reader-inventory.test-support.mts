import type { SharedContext } from 'vouchington-tooling/shared-context'

export const inventoryPath = 'static-code-analysis/post-publication-reader-inventory.json'
export const canonicalBuilder =
  'backend/modules/feed-query-builders/post-publication-eligibility.mts'

export function makeContext(
  inventory: object,
  options: { direct?: string; extra?: [string, string]; extras?: Array<[string, string]> } = {},
): SharedContext {
  const files = new Map<string, string>([
    [inventoryPath, JSON.stringify(inventory)],
    [
      'backend/direct.mts',
      options.direct ??
        "import { buildDirectPostEligibilityFilter } from '@modules/feed-query-builders'\nquery.append(buildDirectPostEligibilityFilter())",
    ],
    ['backend/reader.mts', ''],
    ...(options.extra ? [options.extra] : []),
    ...(options.extras ?? []),
  ])
  return {
    trackedFiles: [...files.keys()],
    trackedFileSet: new Set(files.keys()),
    readTrackedFile: (path: string) => files.get(path) ?? null,
  } as unknown as SharedContext
}
