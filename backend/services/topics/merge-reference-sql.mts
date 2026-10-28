/** Identifiers and expressions come only from the reviewed merge inventory below. */
export type MergeReferenceTable = {
  table: string
  columns: readonly string[]
  collisionKey?: readonly string[]
  live?: string
  preferVerified?: boolean
}
