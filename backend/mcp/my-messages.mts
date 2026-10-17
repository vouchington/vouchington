import { createMergedTool } from './create-merged-tool.mts'
import { readMyMessagesGroup } from './my-message-reads.mts'
import { manageMyMessagesGroup } from './my-message-writes.mts'
export { readMyMessagesGroup, manageMyMessagesGroup }

export const myMessageGroups = [readMyMessagesGroup, manageMyMessagesGroup] as const

export const myMessageTools = [
  createMergedTool(readMyMessagesGroup.name, 'Read My Messages', readMyMessagesGroup.options),
  createMergedTool(manageMyMessagesGroup.name, 'Manage My Messages', manageMyMessagesGroup.options),
]
