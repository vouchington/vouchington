import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { SharedContext } from 'vouchington-tooling/shared-context'
import { checkGhaWorkspacePolicy } from 'vouchington-tooling/gha-workspace-policy'
import { initSqlAst } from './sql-ast.mts'
import { checkMigrationSqlGuard } from './migration-sql-guard.mts'
import { checkUuidv7CreatedAtDdl } from './uuidv7-created-at-ddl-guard.mts'
import { checkModerationHistoryGuard } from './moderation-history-guard.mts'
import { runAstFilePass } from './ast-pass.mts'
import { checkPostgresRuntimeSource } from './postgres-runtime-guard.mts'
import {
  checkStaleSchemaAllowlistEntries,
  matchesPostgresRuntimeFile,
} from './postgres-runtime-guard-runner.mts'
import { checkRouteAdminSurfaceGuard } from './route-admin-surface-guard.mts'
import { checkFiniteEnumRippleGuard } from './finite-enum-ripple-guard.mts'
import { checkSchemaDocDriftGuard } from './schema-doc-drift-guard.mts'
import { checkClientParityMatrixGuard } from './client-parity-matrix-guard.mts'
import { checkRedirectDestinations } from './redirect-destination-guard.mts'
import { checkGhApiShellQuoting } from './gh-api-shell-quoting-guard.mts'
import { checkLivingDocsPinGuard } from './living-docs-pin-guard.mts'
import { checkTransientRetryPromptGuard } from './transient-retry-prompt-guard.mts'
import { checkMonetaryContracts, checkMonetarySnapshot } from './monetary-contract-guard.mts'
import { checkSplitMarkdownCanonicalLinkGuard } from './split-markdown-canonical-link-guard.mts'
import { loadSchemaSnapshot } from './schema-snapshot-loader.mts'
import { checkLifecycleScenarioContract } from './lifecycle-scenario-contract.mts'
import { checkLocalLlmEndpointPolicyContract } from './local-llm-endpoint-policy-contract.mts'
import { checkPostPublicationReaderInventory } from './post-publication-reader-inventory.mts'
import { checkPostPublicationWriterInventory } from './post-publication-writer-inventory.mts'
import { checkPublicSourceLiterals } from './public-source-literal-guard.mts'
import { checkRelationalStorage } from './relational-storage-guard.mts'
import { verifyEntityRelationVotePartitionForeignKeys } from './partition-foreign-key-proof.mts'

type RepoFilePolicyOptions = {
  schemaSnapshot?: unknown
}

export async function checkRepoFilePolicy(
  ctx: SharedContext,
  options: RepoFilePolicyOptions = {},
): Promise<{ errors: string[] }> {
  await initSqlAst()
  const errors: string[] = []

  if (!ctx.isInsideGitRepo) {
    errors.push(`::error::${ctx.repoRoot} is not inside a git repository`)
    return { errors }
  }

  const loadedSnapshot = loadSchemaSnapshot(
    ctx.repoRoot,
    ctx.trackedFileSet,
    options.schemaSnapshot,
  )
  if (loadedSnapshot.snapshot === null) return { errors: loadedSnapshot.errors }
  const schema = loadedSnapshot.snapshot

  const trackedFiles = ctx.trackedFiles.filter(file => existsSync(join(ctx.repoRoot, file)))
  const trackedFileSet = ctx.trackedFileSet

  checkMigrationSqlGuard(ctx.repoRoot, trackedFiles, errors)
  checkMonetaryContracts(ctx.repoRoot, trackedFiles, errors, ctx.readTrackedFile)
  checkMonetarySnapshot(schema, errors)
  const injectedSnapshot = options.schemaSnapshot !== undefined
  const partitionFkErrors = injectedSnapshot ? [] : verifyEntityRelationVotePartitionForeignKeys()
  errors.push(...partitionFkErrors)
  errors.push(
    ...checkRelationalStorage(schema, {
      enforceCatalogFreshness: !injectedSnapshot,
      verifiedPartitionForeignKeys:
        !injectedSnapshot && partitionFkErrors.length === 0
          ? new Set([
              'entity_relation_votes.entity_relation_id',
              'entity_relation_votes.subject_id',
            ])
          : new Set(),
    }),
  )
  checkSplitMarkdownCanonicalLinkGuard(ctx.repoRoot, trackedFiles, errors)
  checkUuidv7CreatedAtDdl(ctx.repoRoot, trackedFiles, errors)
  checkModerationHistoryGuard(ctx.repoRoot, trackedFiles, errors)
  const uuidv7Tables = new Set<string>()
  for (const [tableName, table] of Object.entries(schema.tables)) {
    if (typeof table.columns.created_at?.generatedExpression === 'string') {
      uuidv7Tables.add(tableName)
    }
  }
  // One streaming pass over the union of files these guards inspect: each matched file is
  // parsed once and the AST is discarded before the next file. See ast-pass.mts.
  const [postgresRuntimeErrors] = runAstFilePass(
    ctx.repoRoot,
    trackedFiles,
    [
      {
        matches: matchesPostgresRuntimeFile,
        visit: (file, content, ast, bucket) => {
          bucket.push(...checkPostgresRuntimeSource(file, content, uuidv7Tables, ast))
        },
      },
    ],
    ctx,
  )
  errors.push(...postgresRuntimeErrors)
  checkStaleSchemaAllowlistEntries(ctx.repoRoot, trackedFiles, schema, errors)
  checkRouteAdminSurfaceGuard(ctx.repoRoot, trackedFileSet, errors)
  checkFiniteEnumRippleGuard(ctx, errors, trackedFiles)
  checkSchemaDocDriftGuard(ctx.repoRoot, trackedFiles, schema, errors, ctx.readTrackedFile)
  checkClientParityMatrixGuard(ctx.repoRoot, trackedFiles, errors)
  checkLifecycleScenarioContract(ctx.repoRoot, trackedFiles, errors)
  checkLocalLlmEndpointPolicyContract(ctx.repoRoot, trackedFiles, errors)
  checkPostPublicationReaderInventory(ctx, errors)
  checkPostPublicationWriterInventory(ctx, errors)
  checkRedirectDestinations(ctx.repoRoot, trackedFiles, errors)
  checkGhApiShellQuoting(ctx.repoRoot, trackedFiles, errors)
  const ghaWorkspacePolicy = await checkGhaWorkspacePolicy(ctx, {
    workflowDirectories: ['.github/workflows', 'ci/no-mistakes-workflows'],
  })
  errors.push(...ghaWorkspacePolicy.errors)
  checkTransientRetryPromptGuard(ctx.repoRoot, trackedFiles, errors)
  checkLivingDocsPinGuard(ctx.repoRoot, trackedFiles, errors)
  checkPublicSourceLiterals(ctx.repoRoot, trackedFiles, errors)
  return { errors }
}
