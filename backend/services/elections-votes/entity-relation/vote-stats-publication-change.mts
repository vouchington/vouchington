/** A ranking change can alter the bounded related-URL card selection even when net stays positive. */
export function isEntityRelationPublicationChange(
  relationTable: string,
  priorNet: number,
  nextNet: number,
  priorSort: number,
  nextSort: number,
): boolean {
  const hasPositiveRankedUrl = priorNet > 0 || nextNet > 0
  return (
    priorNet > 0 !== nextNet > 0 ||
    (relationTable === 'relation__post__related__url' &&
      hasPositiveRankedUrl &&
      priorSort !== nextSort)
  )
}
