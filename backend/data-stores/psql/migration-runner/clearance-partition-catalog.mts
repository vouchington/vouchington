type ClearancePartition = { name: string; bound: string }

export type ClearanceCatalogChild = {
  name: string
  bound: string | null
  detach_pending: boolean
}

export function findMissingClearancePartitions(
  expected: readonly ClearancePartition[],
  children: readonly ClearanceCatalogChild[],
): ClearancePartition[] {
  if (children.some(child => child.bound === 'DEFAULT')) {
    throw new Error('Unexpected default partition for post_clearance_changes')
  }
  const attached = new Map(children.map(child => [child.name, child]))
  return expected.filter(({ name, bound }) => {
    const child = attached.get(name)
    if (child && (child.bound !== bound || child.detach_pending)) {
      throw new Error(`Unexpected state for post clearance partition ${name}`)
    }
    return !child
  })
}
