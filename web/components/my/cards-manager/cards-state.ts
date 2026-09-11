import type { ListResponse } from '@/types/api-responses'
import type { AuthorizedUserOfCardSummary, IndividualCard } from '@/types/my'

export interface CardListOverlay {
  upserts: Map<string, IndividualCard>
  deletedIds: Set<string>
}

export function mergeCardPages(
  pages: Array<ListResponse<IndividualCard>>,
  overlay: CardListOverlay,
): IndividualCard[] {
  const cardsById = new Map<string, IndividualCard>()
  for (const page of pages) {
    for (const card of page.results) cardsById.set(card.id, card)
  }
  for (const [id, card] of overlay.upserts) cardsById.set(id, card)
  for (const deletedId of overlay.deletedIds) cardsById.delete(deletedId)

  return [...cardsById.values()]
    .map(card =>
      card.authorized_user_of_id && overlay.deletedIds.has(card.authorized_user_of_id)
        ? { ...card, authorized_user_of_id: null, authorized_user_of_card: null }
        : card,
    )
    .toSorted((left, right) => left.id.localeCompare(right.id))
}

export function getAuthorizedUserParentOptions(
  card: IndividualCard,
  cards: IndividualCard[],
  selectedId: string | null,
): AuthorizedUserOfCardSummary[] {
  const options = new Map<string, AuthorizedUserOfCardSummary>()
  for (const candidate of cards) {
    if (candidate.id === card.id || (candidate.closed_on && candidate.id !== selectedId)) continue
    options.set(candidate.id, {
      id: candidate.id,
      opened_on: candidate.opened_on,
      closed_on: candidate.closed_on,
      card: candidate.card,
    })
  }
  const hydratedParent = card.authorized_user_of_card
  if (
    hydratedParent &&
    hydratedParent.id === selectedId &&
    hydratedParent.id !== card.id &&
    !options.has(hydratedParent.id)
  ) {
    options.set(hydratedParent.id, hydratedParent)
  }
  return [...options.values()].toSorted((left, right) => left.id.localeCompare(right.id))
}
