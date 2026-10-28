export function getHnDiscussionsStoryResponse(input: RequestInfo | URL): Response | undefined {
  const requestUrl =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return undefined
  }

  if (url.origin !== 'https://hn.algolia.com' || url.pathname !== '/api/v1/search') {
    return undefined
  }

  const sourceUrl = url.searchParams.get('query')
  const hits =
    sourceUrl === 'https://example.com/story'
      ? [
          {
            objectID: '424242',
            title: 'Show HN: Community discussion',
            url: sourceUrl,
            points: 12,
            num_comments: 3,
          },
        ]
      : []
  return new Response(JSON.stringify({ hits }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export function waitForHnDiscussionTitle(container: ParentNode): Promise<Element> {
  const selector = '[data-pw="hn-discussions-title"]'
  const current = container.querySelector(selector)
  if (current) return Promise.resolve(current)

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const title = container.querySelector(selector)
      if (!title) return
      observer.disconnect()
      resolve(title)
    })
    observer.observe(container, { childList: true, subtree: true })
  })
}
