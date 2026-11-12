/** Deletes the two stored directions while their shared relation-pair lock is held. */
export async function deleteBidirectionalRelationRows(
  deleteForwardRows: () => Promise<unknown>,
  deleteReverseRows: () => Promise<unknown>,
): Promise<void> {
  await deleteForwardRows()
  await deleteReverseRows()
}
