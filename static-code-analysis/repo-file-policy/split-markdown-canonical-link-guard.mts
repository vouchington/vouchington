import { readFileSync } from 'node:fs'
import { dirname, join, normalize, relative, sep } from 'node:path'

import {
  canonicalFragmentTargets,
  canonicalWholeFileTargets,
} from './canonical-markdown-child-links.mts'

const SPLIT_PARENT_PATHS = [
  'docs/requirements/ADMIN-NAVIGATION-MATRIX.md',
  'docs/requirements/CLIENT-PARITY-MATRIX.md',
  'docs/requirements/ENTITIES.md',
  'docs/requirements/ENTITY-ACTION-MATRIX.md',
  'docs/requirements/ENTITY-LIFECYCLE-MATRIX.md',
  'docs/requirements/admin/CUSTOMER-SUPPORT.md',
  'docs/requirements/anatomy/fediverse-instance.md',
  'docs/requirements/community/community-lists.md',
  'docs/requirements/content/LISTS.md',
  'docs/requirements/content/PODCASTS.md',
  'docs/requirements/content/TOPICS.md',
  'docs/requirements/content/stories.md',
  'docs/requirements/moderation/MODERATION-FLOWS.md',
  'docs/requirements/moderation/MODERATION-TEST-MATRIX.md',
  'docs/requirements/moderation/POST-MODERATION.md',
  'docs/requirements/moderation/REPORTING.md',
  'docs/requirements/moderation/community-moderation.md',
  'docs/requirements/navigation/ACTIONS.md',
  'docs/requirements/navigation/ASIDES.md',
  'docs/requirements/navigation/COMPONENTS.md',
  'docs/requirements/navigation/NAVIGATION.md',
  'docs/requirements/navigation/SIDEBAR.md',
  'docs/requirements/platform/JOB-REPLAYABILITY.md',
  'docs/requirements/platform/data-points-spec.md',
  'docs/requirements/security/SECURITY-NEXTJS-CVES.md',
  'docs/requirements/security/SECURITY.md',
  'docs/requirements/trust-safety/trust-system.md',
  'docs/requirements/users/REFERRAL-LINKS.md',
  'docs/requirements/users/memberships.md',
] as const

function repoRelativePath(repoRoot: string, rootFile: string, target: string): string {
  return relative(repoRoot, normalize(join(repoRoot, dirname(rootFile), target)))
    .split(sep)
    .join('/')
}

export function checkSplitMarkdownCanonicalLinkGuard(
  repoRoot: string,
  trackedFiles: readonly string[],
  errors: string[],
): void {
  const trackedFileSet = new Set(trackedFiles)
  for (const rootFile of SPLIT_PARENT_PATHS) {
    if (!trackedFileSet.has(rootFile)) continue
    const rootContent = readFileSync(join(repoRoot, rootFile), 'utf8')
    const wholeFileTargets = new Set(
      [...canonicalWholeFileTargets(rootContent)].map(target =>
        repoRelativePath(repoRoot, rootFile, target),
      ),
    )
    for (const target of canonicalFragmentTargets(rootContent)) {
      if (wholeFileTargets.has(repoRelativePath(repoRoot, rootFile, target))) continue
      errors.push(
        `::error file=${rootFile}::${rootFile}: canonical child ${target} is linked only by a fragment; add a whole-file Markdown link for composition`,
      )
    }
  }
}
