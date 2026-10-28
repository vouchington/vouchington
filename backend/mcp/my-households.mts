import { createMergedTool } from './create-merged-tool.mts'
import { readMyHouseholdsGroup } from './my-household-reads.mts'
import { manageMyHouseholdsGroup } from './my-household-writes.mts'

export const myHouseholdTools = [
  createMergedTool(readMyHouseholdsGroup.name, 'Read My Households', readMyHouseholdsGroup.options),
  createMergedTool(
    manageMyHouseholdsGroup.name,
    'Manage My Households',
    manageMyHouseholdsGroup.options,
  ),
]
