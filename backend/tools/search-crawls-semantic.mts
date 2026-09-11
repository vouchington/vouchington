import { toolsSearchCrawlsSemantic } from '@services/crawls/tools/semantic'
import { createCrawlSearchTool } from './search-crawl-tool.mts'

const tool = createCrawlSearchTool({
  name: 'search_crawls_semantic',
  description:
    'Search crawled web content using semantic similarity (vector embeddings). Best for finding conceptually related content.',
  queryDescription: 'Natural language search query',
  searchFn: toolsSearchCrawlsSemantic,
  meta: { surfaces: ['internal'], annotations: { readOnlyHint: true }, api: null },
})

export default tool
