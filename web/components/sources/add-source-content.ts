export type AddSourceKind = 'news' | 'podcast' | 'video'

interface AddSourceKindContent {
  buttonLabel: string
  dialogTitle: string
  inputLabel: string
  inputPlaceholder: string
  dialogDescription: string
}

export const ADD_SOURCE_CONTENT: Record<AddSourceKind, AddSourceKindContent> = {
  news: {
    buttonLabel: 'Add News Source',
    dialogTitle: 'Add a news source',
    inputLabel: 'Feed URL',
    inputPlaceholder: 'https://example.com/feed.xml',
    dialogDescription: 'Enter a URL to add it as a source.',
  },
  podcast: {
    buttonLabel: 'Add Podcast',
    dialogTitle: 'Add a podcast',
    inputLabel: 'Podcast RSS URL',
    inputPlaceholder: 'https://example.com/podcast.xml',
    dialogDescription: 'Enter a URL to add it as a source.',
  },
  video: {
    buttonLabel: 'Add Channel',
    dialogTitle: 'Add a channel',
    inputLabel: 'Channel URL',
    inputPlaceholder: 'https://youtube.com/@channel',
    dialogDescription: 'Enter a URL to add it as a source.',
  },
}
