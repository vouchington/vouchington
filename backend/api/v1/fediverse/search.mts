import {
  createFediverseAdapters,
  searchFediverse as search,
  type FediverseSearchOptions,
  type FediverseSearchResponse,
} from '@services/fediverse-search'

const adapters = createFediverseAdapters()

export async function searchFediverse(
  options: FediverseSearchOptions,
): Promise<FediverseSearchResponse> {
  return await search(options, adapters)
}
