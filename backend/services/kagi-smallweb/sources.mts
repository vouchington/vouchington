export type FeedListSource = {
  name: string
  url: string
  type: 'web' | 'comic' | 'youtube'
}

export const FEED_LIST_SOURCES: FeedListSource[] = [
  {
    name: 'smallweb',
    url: 'https://raw.githubusercontent.com/kagisearch/smallweb/main/smallweb.txt',
    type: 'web',
  },
  {
    name: 'smallcomic',
    url: 'https://raw.githubusercontent.com/kagisearch/smallweb/main/smallcomic.txt',
    type: 'comic',
  },
  {
    name: 'smallyt',
    url: 'https://raw.githubusercontent.com/kagisearch/smallweb/main/smallyt.txt',
    type: 'youtube',
  },
]
