/* oxlint-disable max-lines -- moderation doc-sync guard keeps related parsing/checking logic together */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ENTITY_TYPE_TO_REPORT_FK } from '../../backend/services/moderation-reports/config.mts'
import {
  MODERATION_POLICY,
  MODERATION_REPORT_ENTITY_TYPES,
  MODERATION_REPORT_REASONS,
  MODERATION_REPORT_REASON_SEVERITY_ORDER,
  CONTENT_POLICY_CATEGORIES,
  MODERATION_JUDGEMENT_ACTIONS,
  MODERATION_APPEAL_ACTIONS,
  MODERATION_POLICY_SEVERITIES,
} from '../../ts-shared/utils/moderation-policy.mts'
import {
  extractActionsModerationAssertions,
  POST_ONLY_VOTE_MANIPULATION_PATTERN,
} from './moderation-policy-doc-sync-actions-extractors.mts'
import {
  assertExactDocTokens,
  assertExactOrderedDocTokens,
} from './moderation-policy-doc-sync-assertions.mts'
import {
  extractApiReportEntityCanonicalList,
  extractApiReportEntityRequestBodyList,
  extractReportEntityList,
  extractReportJudgementReasonRankList,
  extractReportReasonList,
  extractReportingSchemaEntityList,
  extractReportingSchemaReasonList,
  extractServiceReadmeTargetFkList,
} from './moderation-policy-doc-sync-reporting.mts'
import {
  extractPolicyMatrixAllEntityList,
  extractPolicyMatrixAppealActionList,
  extractPolicyMatrixDerivedLists,
  extractPolicyMatrixJudgementActionList,
  extractPolicyMatrixKeys,
  extractPolicyMatrixRows,
  extractPolicyMatrixSeverityList,
  type PolicyMatrixRow,
} from './moderation-policy-doc-sync-policy-matrix.mts'
import { readCanonicalMarkdownChildren } from './canonical-markdown-children.mts'
import { actionError, assertExactLocatedDocTokens } from './moderation-policy-doc-sync-actions.mts'

const MODERATION_POLICY_DOC_PATH = 'docs/requirements/moderation/MODERATION-POLICY-MATRIX.md'
const REPORT_JUDGEMENTS_DOC_PATH = 'docs/requirements/moderation/REPORT-JUDGEMENTS.md'
const ACTIONS_DOC_PATH = 'docs/requirements/navigation/ACTIONS.md'

const MODERATION_REPORT_SYNC_DOC_PATHS = [
  'docs/requirements/moderation/REPORTING.md',
  'docs/requirements/moderation/MODERATION-FLOWS.md',
  'backend/api/v1/reports/README.md',
  'backend/services/moderation-reports/README.md',
  ACTIONS_DOC_PATH,
]

export function isModerationPolicyDocSyncPath(file: string): boolean {
  return (
    file === MODERATION_POLICY_DOC_PATH ||
    file === REPORT_JUDGEMENTS_DOC_PATH ||
    MODERATION_REPORT_SYNC_DOC_PATHS.includes(file)
  )
}

export function checkModerationPolicyDocSync(
  repoRoot: string,
  trackedFiles: readonly string[],
  contentsByFile: Map<string, string>,
  errors: string[],
): void {
  const hasModerationPolicySource = existsSync(
    join(repoRoot, 'ts-shared/utils/moderation-policy.mts'),
  )
  const syncDocPaths = MODERATION_REPORT_SYNC_DOC_PATHS.filter(
    path =>
      path !== ACTIONS_DOC_PATH ||
      hasModerationPolicySource ||
      existsSync(join(repoRoot, ACTIONS_DOC_PATH)),
  )
  const requiredPaths = [MODERATION_POLICY_DOC_PATH, ...syncDocPaths, REPORT_JUDGEMENTS_DOC_PATH]
  const missingPaths = requiredPaths.filter(path => !existsSync(join(repoRoot, path)))
  if (missingPaths.length === requiredPaths.length && !hasModerationPolicySource) {
    return
  }

  for (const path of missingPaths) {
    errors.push(`::error file=${path}::${path}: required moderation policy/report doc is missing`)
  }

  const getComposition = (path: string) => {
    const content = contentsByFile.get(path) ?? readFileSync(join(repoRoot, path), 'utf8')
    return readCanonicalMarkdownChildren(
      repoRoot,
      path,
      content,
      trackedFiles,
      contentsByFile,
      errors,
    )
  }

  if (!missingPaths.includes(MODERATION_POLICY_DOC_PATH)) {
    const content = getComposition(MODERATION_POLICY_DOC_PATH).content
    assertExactDocTokens({
      actual: extractPolicyMatrixKeys(content),
      errors,
      expected: MODERATION_POLICY.map(entry => entry.key),
      file: MODERATION_POLICY_DOC_PATH,
      label: 'moderation policy key',
    })
    assertExactDocTokens({
      actual: extractPolicyMatrixAllEntityList(content),
      errors,
      expected: MODERATION_REPORT_ENTITY_TYPES,
      file: MODERATION_POLICY_DOC_PATH,
      label: 'policy matrix all entity type',
    })
    const derivedLists = extractPolicyMatrixDerivedLists(content)
    assertExactDocTokens({
      actual: derivedLists.reportReasons,
      errors,
      expected: MODERATION_REPORT_REASONS,
      file: MODERATION_POLICY_DOC_PATH,
      label: 'derived moderation report reason',
    })
    assertExactDocTokens({
      actual: derivedLists.aiCategories,
      errors,
      expected: CONTENT_POLICY_CATEGORIES,
      file: MODERATION_POLICY_DOC_PATH,
      label: 'derived moderation AI category',
    })
    assertExactDocTokens({
      actual: extractPolicyMatrixJudgementActionList(content),
      errors,
      expected: MODERATION_JUDGEMENT_ACTIONS,
      file: MODERATION_POLICY_DOC_PATH,
      label: 'policy matrix judgement action',
    })
    assertExactDocTokens({
      actual: extractPolicyMatrixAppealActionList(content),
      errors,
      expected: MODERATION_APPEAL_ACTIONS,
      file: MODERATION_POLICY_DOC_PATH,
      label: 'policy matrix appeal action',
    })
    assertExactDocTokens({
      actual: extractPolicyMatrixSeverityList(content),
      errors,
      expected: MODERATION_POLICY_SEVERITIES,
      file: MODERATION_POLICY_DOC_PATH,
      label: 'policy matrix severity',
    })
    assertExactPolicyMatrixRows({
      actual: extractPolicyMatrixRows(content),
      errors,
      expected: MODERATION_POLICY.map(entry => ({
        key: entry.key,
        label: entry.label,
        reportReason: entry.isReportReason,
        aiCategory: entry.isAiCategory,
        surfaces: policyMatrixSurfaces(entry.surfaces),
        severity: entry.severity,
        appealEligible: entry.appealEligible,
        recommendedAction: entry.recommendedAction,
      })),
      file: MODERATION_POLICY_DOC_PATH,
    })
  }

  for (const docPath of syncDocPaths) {
    if (missingPaths.includes(docPath)) continue

    const composition = getComposition(docPath)
    const content = composition.content
    if (docPath === ACTIONS_DOC_PATH) {
      const actions = extractActionsModerationAssertions(composition, { file: docPath, line: 1 })
      assertExactLocatedDocTokens({
        actual: actions.reportEntities,
        errors,
        expected: MODERATION_REPORT_ENTITY_TYPES,
        fallbackSource: actions.reportSectionSource,
        label: 'moderation report entity type',
      })
      if (actions.reportTableEntities.length > 0) {
        assertExactLocatedDocTokens({
          actual: actions.reportTableEntities,
          errors,
          expected: MODERATION_REPORT_ENTITY_TYPES,
          fallbackSource: actions.reportTableSource,
          label: 'ACTIONS report table entity type',
        })
      }
      assertExactLocatedDocTokens({
        actual: actions.reportReasons,
        errors,
        expected: MODERATION_REPORT_REASONS,
        fallbackSource: actions.reportReasonsSource,
        label: 'moderation report reason',
      })
      const hasVoteManipulationPostOnlyWording = POST_ONLY_VOTE_MANIPULATION_PATTERN.test(content)
      if (requiresVoteManipulationPostOnly() && !hasVoteManipulationPostOnlyWording) {
        actionError(
          errors,
          actions.voteManipulationWordingSource,
          'vote_manipulation must be documented as post-only',
        )
      } else if (!requiresVoteManipulationPostOnly() && hasVoteManipulationPostOnlyWording) {
        actionError(
          errors,
          actions.voteManipulationWordingSource,
          'stale vote_manipulation post-only wording is documented',
        )
      }
      continue
    }
    assertExactDocTokens({
      actual: extractReportEntityList(docPath, content),
      errors,
      expected: MODERATION_REPORT_ENTITY_TYPES,
      file: docPath,
      label: 'moderation report entity type',
    })
    if (
      docPath === 'backend/services/moderation-reports/README.md' &&
      content.includes('Target FK')
    ) {
      assertExactDocTokens({
        actual: extractServiceReadmeTargetFkList(content),
        errors,
        expected: moderationReportTargetFks(),
        file: docPath,
        label: 'service README moderation report target FK',
      })
    }
    if (
      docPath === 'docs/requirements/moderation/REPORTING.md' &&
      content.includes('CREATE TABLE moderation_reports')
    ) {
      assertExactDocTokens({
        actual: extractReportingSchemaEntityList(content),
        errors,
        expected: MODERATION_REPORT_ENTITY_TYPES,
        file: docPath,
        label: 'REPORTING schema moderation report entity type',
      })
      assertExactDocTokens({
        actual: extractReportingSchemaReasonList(content),
        errors,
        expected: MODERATION_REPORT_REASONS,
        file: docPath,
        label: 'REPORTING schema moderation report reason',
      })
    }
    if (
      docPath === 'backend/api/v1/reports/README.md' &&
      (content.includes('Canonical `entityType` values are') || content.includes('"entityType"'))
    ) {
      assertExactDocTokens({
        actual: extractApiReportEntityCanonicalList(content),
        errors,
        expected: MODERATION_REPORT_ENTITY_TYPES,
        file: docPath,
        label: 'API canonical moderation report entity type',
      })
      assertExactDocTokens({
        actual: extractApiReportEntityRequestBodyList(content),
        errors,
        expected: MODERATION_REPORT_ENTITY_TYPES,
        file: docPath,
        label: 'API request moderation report entity type',
      })
    }
    assertExactDocTokens({
      actual: extractReportReasonList(docPath, content),
      errors,
      expected: MODERATION_REPORT_REASONS,
      file: docPath,
      label: 'moderation report reason',
    })
    const hasVoteManipulationPostOnlyWording = POST_ONLY_VOTE_MANIPULATION_PATTERN.test(content)
    if (requiresVoteManipulationPostOnly()) {
      if (!hasVoteManipulationPostOnlyWording) {
        errors.push(
          `::error file=${docPath}::${docPath}: vote_manipulation must be documented as post-only`,
        )
      }
    } else if (hasVoteManipulationPostOnlyWording) {
      errors.push(
        `::error file=${docPath}::${docPath}: stale vote_manipulation post-only wording is documented`,
      )
    }
  }

  if (!missingPaths.includes(REPORT_JUDGEMENTS_DOC_PATH)) {
    assertExactOrderedDocTokens({
      actual: extractReportJudgementReasonRankList(
        getComposition(REPORT_JUDGEMENTS_DOC_PATH).content,
      ),
      errors,
      expected: MODERATION_REPORT_REASON_SEVERITY_ORDER,
      file: REPORT_JUDGEMENTS_DOC_PATH,
      label: 'report judgement reason rank',
    })
  }
}

function moderationReportTargetFks(): string[] {
  return [
    ...new Set(
      MODERATION_REPORT_ENTITY_TYPES.map(entityType => ENTITY_TYPE_TO_REPORT_FK[entityType]),
    ),
  ]
}

function requiresVoteManipulationPostOnly(): boolean {
  const policy = MODERATION_POLICY.find(
    entry => entry.key === 'vote_manipulation' && entry.isReportReason,
  )
  return policy?.surfaces.length === 1 && policy.surfaces[0] === 'post'
}

function assertExactPolicyMatrixRows({
  actual,
  errors,
  expected,
  file,
}: {
  actual: readonly PolicyMatrixRow[]
  errors: string[]
  expected: readonly PolicyMatrixRow[]
  file: string
}): void {
  const actualByKey = new Map<string, PolicyMatrixRow>()
  const duplicateKeys = new Set<string>()
  const malformedKeys = new Set<string>()
  for (const row of actual) {
    if (actualByKey.has(row.key)) duplicateKeys.add(row.key)
    actualByKey.set(row.key, row)
    if (row.malformed) malformedKeys.add(row.key)
  }
  for (const key of malformedKeys) {
    errors.push(
      `::error file=${file}::${file}: moderation policy row ${key} is missing or malformed`,
    )
  }
  for (const key of duplicateKeys) {
    errors.push(
      `::error file=${file}::${file}: duplicate moderation policy row ${key} is documented`,
    )
  }
  for (const expectedRow of expected) {
    if (malformedKeys.has(expectedRow.key)) continue
    const actualRow = actualByKey.get(expectedRow.key)
    if (!actualRow) {
      errors.push(
        `::error file=${file}::${file}: moderation policy row ${expectedRow.key} is missing or malformed`,
      )
      continue
    }
    const expectedSignature = policyMatrixRowSignature(expectedRow)
    const actualSignature = policyMatrixRowSignature(actualRow)
    if (actualSignature === expectedSignature) continue
    errors.push(
      `::error file=${file}::${file}: moderation policy row ${expectedRow.key} must be ${expectedSignature}`,
    )
  }
}

function policyMatrixRowSignature(row: PolicyMatrixRow): string {
  return [
    row.key,
    row.label,
    row.reportReason ? '✓' : '—',
    row.aiCategory ? '✓' : '—',
    row.surfaces,
    row.severity,
    row.appealEligible ? '✓' : '—',
    row.recommendedAction,
  ].join(' | ')
}

function policyMatrixSurfaces(surfaces: readonly string[]): string {
  return surfaces.length === MODERATION_REPORT_ENTITY_TYPES.length &&
    MODERATION_REPORT_ENTITY_TYPES.every(entityType => surfaces.includes(entityType))
    ? 'all'
    : surfaces.join(', ')
}
