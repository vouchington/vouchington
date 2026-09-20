import { useState } from 'react'

export function useCopyrightTargetSelection(targetIds: string[]) {
  const [selection, setSelection] = useState<string[] | null>(null)
  const selectedTargetIds =
    selection === null ? targetIds : selection.filter(targetId => targetIds.includes(targetId))
  return [selectedTargetIds, setSelection] as const
}
