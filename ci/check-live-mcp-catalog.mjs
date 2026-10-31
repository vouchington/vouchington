import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { close as closePsql } from '../backend/data-stores/psql/index.mts'
import { onGracefulShutdown } from '../backend/data-stores/valkey-core/index.mts'
import { communityModerationGroups } from '../backend/mcp/community-moderation-tools.mts'
import { readMyHouseholdsGroup } from '../backend/mcp/my-household-reads.mts'
import { manageMyHouseholdsGroup } from '../backend/mcp/my-household-writes.mts'
import { readMyMessagesGroup } from '../backend/mcp/my-message-reads.mts'
import { manageMyMessagesGroup } from '../backend/mcp/my-message-writes.mts'
import { ALL_TOOLS } from '../backend/mcp/registry/index.mts'
import { participationWriteGroups } from '../backend/mcp/registry/participation-write-groups.mts'
import { userMergedAccountGroups } from '../backend/mcp/registry/user-merged-account-tools.mts'
import { userMergedParticipationGroups } from '../backend/mcp/registry/user-merged-participation-tools.mts'
import { userMergedReadingGroups } from '../backend/mcp/registry/user-merged-reading-tools.mts'
import { findCatalogContractViolations } from '../backend/services/mcp-tools/catalog/check-catalog-contracts.mts'
import { listMcpToolsForUser } from '../backend/services/mcp-tools/list-tools.mts'
import { runLiveMcpCatalogCheck } from './live-mcp-catalog-check.mts'
import {
  anonymousMcpSourceCounts,
  isUnregisteredMcpToolFile,
  mcpToolFilesFromEntries,
} from './mcp-tool-file-registration.mts'

const toolsDir = fileURLToPath(new URL('../backend/mcp/', import.meta.url))

async function unregisteredMcpToolFiles() {
  const files = mcpToolFilesFromEntries(await readdir(toolsDir))
  const registeredNames = new Set(ALL_TOOLS.map(tool => tool.schema.name))
  const sourceCounts = anonymousMcpSourceCounts([
    readMyMessagesGroup,
    manageMyMessagesGroup,
    readMyHouseholdsGroup,
    manageMyHouseholdsGroup,
    ...participationWriteGroups,
    ...userMergedAccountGroups,
    ...userMergedParticipationGroups,
    ...userMergedReadingGroups,
    ...communityModerationGroups,
  ])
  const unregistered = []
  for (const file of files) {
    const mod = await import(pathToFileURL(join(toolsDir, file)).href)
    if (isUnregisteredMcpToolFile(mod.default, registeredNames, sourceCounts))
      unregistered.push(file)
  }
  return unregistered
}

await runLiveMcpCatalogCheck({
  ready: onGracefulShutdown.waitForInitialization(),
  check: async () => {
    const unregistered = await unregisteredMcpToolFiles()
    const errors = findCatalogContractViolations(ALL_TOOLS, listMcpToolsForUser, 15)
    const failures = []
    if (unregistered.length > 0) {
      failures.push(`Unregistered MCP tool files:\n${unregistered.join('\n')}`)
    }
    if (errors.length > 0) failures.push(`MCP catalog contract violations:\n${errors.join('\n')}`)
    if (failures.length > 0) throw new Error(failures.join('\n'))
  },
  closeResources: [onGracefulShutdown, closePsql],
})
