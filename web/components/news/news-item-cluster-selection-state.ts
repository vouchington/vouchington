import type { FirstStorySelection, FirstStorySelectionState } from './news-item-cluster-projection'

export function retainFirstStorySelections(
  previous: FirstStorySelectionState,
  scope: Pick<FirstStorySelectionState, 'key' | 'viewerId'>,
  candidates: Map<string, FirstStorySelection>,
): FirstStorySelectionState {
  const sameScope = previous.key === scope.key && previous.viewerId === scope.viewerId
  if (
    sameScope &&
    previous.byStory.size === candidates.size &&
    [...candidates.keys()].every(id => previous.byStory.has(id))
  )
    return previous
  return {
    ...scope,
    byStory: new Map(
      [...candidates].map(([id, selection]) => [
        id,
        sameScope ? (previous.byStory.get(id) ?? selection) : selection,
      ]),
    ),
  }
}
