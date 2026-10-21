import { createMergedTool } from './create-merged-tool.mts'
import { readMyHouseholdsGroup } from './my-household-reads.mts'
import { manageMyHouseholdsGroup } from './my-household-writes.mts'
export { readMyHouseholdsGroup, manageMyHouseholdsGroup }

export const myHouseholdGroups = [readMyHouseholdsGroup, manageMyHouseholdsGroup] as const
export const myHouseholdTools = [
  createMergedTool(readMyHouseholdsGroup.name, 'Read My Households', readMyHouseholdsGroup.options),
  createMergedTool(
    manageMyHouseholdsGroup.name,
    'Manage My Households',
    manageMyHouseholdsGroup.options,
  ),
]
