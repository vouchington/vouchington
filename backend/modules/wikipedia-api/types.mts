export interface WikipediaSummary {
  pageid: number
  title: string
  url: string
  extract: string | null
  description: string | null
  thumbnail_url: string | null
}

export interface WikipediaSearchResult {
  title: string
  pageid: number
}
