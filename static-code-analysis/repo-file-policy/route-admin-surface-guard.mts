import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type AdminSurfacePredicate,
  callsRequireAdmin,
  factoryReturnsPageThatCalls,
  rejectsNonReferralProgramTopics,
  rendersPageWithAside,
} from './route-admin-surface-ast.mts'

interface RequiredPredicate {
  predicate: AdminSurfacePredicate
  description: string
}

interface RequiredFilePolicy {
  file: string
  requirements: RequiredPredicate[]
}

const ENTITY_ADMIN_SURFACE_REQUIREMENTS: RequiredFilePolicy[] = [
  {
    file: 'web/app/(topics)/topics/create/page.tsx',
    requirements: [
      { predicate: callsRequireAdmin, description: 'call requireAdmin()' },
      { predicate: rendersPageWithAside, description: 'render inside PageWithAside' },
    ],
  },
  {
    file: 'web/app/(topics)/topics/aliases/page.tsx',
    requirements: [
      { predicate: callsRequireAdmin, description: 'call requireAdmin()' },
      { predicate: rendersPageWithAside, description: 'render inside PageWithAside' },
    ],
  },
  {
    file: 'web/app/(crawlers)/crawler/[id]/layout.tsx',
    requirements: [
      { predicate: callsRequireAdmin, description: 'call requireAdmin()' },
      { predicate: rendersPageWithAside, description: 'render inside PageWithAside' },
    ],
  },
  {
    file: 'web/lib/routes/referral-validation-factories.tsx',
    requirements: [
      { predicate: callsRequireAdmin, description: 'call requireAdmin()' },
      {
        predicate: rejectsNonReferralProgramTopics,
        description: 'notFound() non-referral-program topics',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createReferralProgramValidationsListPage',
          'ReferralProgramValidationsListPage',
          'loadReferralProgram',
          'id',
        ),
        description: 'load the guarded referral program in the validations list route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createReferralProgramValidationNewPage',
          'NewReferralProgramValidationPage',
          'loadReferralProgram',
          'id',
        ),
        description: 'load the guarded referral program in the validation new route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createReferralProgramValidationDetailPage',
          'ReferralProgramValidationDetailPage',
          'loadReferralProgram',
          'id',
        ),
        description: 'load the guarded referral program in the validation detail route',
      },
    ],
  },
  {
    file: 'web/lib/routes/topic-validations-factory.tsx',
    requirements: [
      { predicate: callsRequireAdmin, description: 'call requireAdmin()' },
      {
        predicate: rejectsNonReferralProgramTopics,
        description: 'notFound() non-referral-program topics',
      },
    ],
  },
  {
    file: 'web/lib/routes/topic-settings-factories.tsx',
    requirements: [
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsPage',
          'TopicSettingsRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings index route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsAboutPage',
          'TopicSettingsAboutRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings about route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsBehaviorPage',
          'TopicSettingsBehaviorRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings behavior route',
      },
    ],
  },
  {
    file: 'web/lib/routes/topic-management-factories.tsx',
    requirements: [
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsDomainsPage',
          'TopicSettingsDomainsRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings domains route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsSourcePage',
          'TopicSettingsSourceRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings source route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsAliasesPage',
          'TopicSettingsAliasesRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings aliases route',
      },
      {
        predicate: factoryReturnsPageThatCalls(
          'createTopicSettingsMergePage',
          'TopicSettingsMergeRoutePage',
          'requireAdmin',
        ),
        description: 'call requireAdmin() in the topic settings merge route',
      },
    ],
  },
]

export function checkRouteAdminSurfaceGuard(
  repoRoot: string,
  trackedFileSet: ReadonlySet<string>,
  errors: string[],
): void {
  const isVouchaRepo =
    trackedFileSet.has('pnpm-lock.yaml') && trackedFileSet.has('web/package.json')
  const shouldEnforceAdminSurfaceFiles =
    isVouchaRepo ||
    ENTITY_ADMIN_SURFACE_REQUIREMENTS.some(policy => trackedFileSet.has(policy.file))

  for (const policy of ENTITY_ADMIN_SURFACE_REQUIREMENTS) {
    if (!trackedFileSet.has(policy.file)) {
      if (shouldEnforceAdminSurfaceFiles) {
        errors.push(
          `::error file=${policy.file}::${policy.file}: protected entity-scoped admin surface must exist; see docs/requirements/navigation/ROUTES.md#route-relocation-audit`,
        )
      }
      continue
    }
    const fullPath = join(repoRoot, policy.file)
    if (!existsSync(fullPath)) {
      errors.push(
        `::error file=${policy.file}::${policy.file}: protected entity-scoped admin surface must exist; see docs/requirements/navigation/ROUTES.md#route-relocation-audit`,
      )
      continue
    }
    const content = readFileSync(fullPath, 'utf8')
    for (const requirement of policy.requirements) {
      if (!requirement.predicate(content, policy.file)) {
        errors.push(
          `::error file=${policy.file}::${policy.file}: entity-scoped admin surface must ${requirement.description}; see docs/requirements/navigation/ROUTES.md#route-relocation-audit`,
        )
      }
    }
  }
}
