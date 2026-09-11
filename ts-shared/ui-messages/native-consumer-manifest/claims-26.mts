import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical native consumer claims, kept in code-point key order. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_26 = [
  { key: 'extracted.votes.semanticVote.accurate', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.choose', consumers: ['dotnet'] },
  { key: 'extracted.votes.semanticVote.clear', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.confirm', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.disavow', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.dislike', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.dispute', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.inaccurate', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.like', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.neutral', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.oppose', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.signIn', consumers: ['dotnet'] },
  { key: 'extracted.votes.semanticVote.support', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.vote', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.votes.semanticVote.vouch', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
