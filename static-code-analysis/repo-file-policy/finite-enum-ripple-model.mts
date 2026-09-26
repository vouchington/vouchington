export type ReadTrackedFile = (file: string) => string

export interface RoutedPage {
  file: string
  isTopLevel: boolean
  slug: string
}

export interface FiniteEnumFiles {
  existingFileSet: ReadonlySet<string>
  postCollectionPages: RoutedPage[]
  postCreatePages: RoutedPage[]
  postDetailPages: RoutedPage[]
  topicCollectionPages: RoutedPage[]
  topicComponentFiles: string[]
  topicDetailPages: RoutedPage[]
}
