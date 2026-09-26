import { useState } from 'react'

interface HostnameModerationInput {
  hostnameId: string
  blocked: boolean | null | undefined
  crawlable: boolean | null | undefined
  linkRelFollow: boolean | null | undefined
}

interface HostnameModerationState {
  key: string
  isBlocked: boolean
  isCrawlable: boolean
  isLinkFollow: boolean
}

function moderationSnapshot(input: HostnameModerationInput): HostnameModerationState {
  return {
    key: `${input.hostnameId}:${input.blocked === true}:${input.crawlable === true}:${input.linkRelFollow === true}`,
    isBlocked: input.blocked === true,
    isCrawlable: input.crawlable === true,
    isLinkFollow: input.linkRelFollow === true,
  }
}

export function useHostnameModerationState(input: HostnameModerationInput) {
  const next = moderationSnapshot(input)
  const [state, setState] = useState(next)
  const current = state.key === next.key ? state : next

  return {
    isBlocked: current.isBlocked,
    isCrawlable: current.isCrawlable,
    isLinkFollow: current.isLinkFollow,
    setBlocked(isBlocked: boolean) {
      setState({ ...current, key: next.key, isBlocked })
    },
    setCrawlable(isCrawlable: boolean) {
      setState({ ...current, key: next.key, isCrawlable })
    },
    setLinkFollow(isLinkFollow: boolean) {
      setState({ ...current, key: next.key, isLinkFollow })
    },
  }
}
