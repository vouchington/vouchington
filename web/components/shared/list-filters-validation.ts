interface SortOption<T extends string = string> {
  value: T
}

export function getSearchDefaultSortValidationError<U extends string>(
  searchDefaultSort: NoInfer<U> | undefined,
  searchOnlySortOptions: SortOption<U>[] | undefined,
): string | undefined {
  if (searchDefaultSort == null) return undefined
  if (searchOnlySortOptions == null) {
    return `ListFilters: searchDefaultSort "${searchDefaultSort}" is set but searchOnlySortOptions is absent`
  }
  if (!searchOnlySortOptions.some(opt => opt.value === searchDefaultSort)) {
    return `ListFilters: searchDefaultSort "${searchDefaultSort}" must be present in searchOnlySortOptions`
  }
  return undefined
}
