import { getTopicByAny } from '../services/topics/get.mts'
import { mergeTopicAliases } from '../services/topics/merge-aliases.mts'
import { createTestUser } from './entities/users.mts'

/** Exercise the current merge contract when a reader fixture owns existing references. */
export async function mergeReferencedTopicsForTest(sourceId: string, destinationId: string) {
  const administrator = await createTestUser({ administrator: true })
  const [source, destination] = await Promise.all([
    getTopicByAny(sourceId),
    getTopicByAny(destinationId),
  ])
  if (!source || !destination) throw new Error('Merge fixture topics must exist')
  return mergeTopicAliases(administrator, source, destination)
}
