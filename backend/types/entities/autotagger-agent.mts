/**
 * The scoped reasoning autotagger (C7): a second classifier on the shared classifier-run lifecycle
 * that runs once per subject per content version, after the C6 `tagging` classifier, over the topics
 * followed by paying users that C6 did not apply. The slug names its classifier configuration and
 * is also its spend-attribution workload, so its usage never mixes with C6's `autotagger` workload.
 */
export const AUTOTAGGER_AGENT_SLUG = 'autotagger-agent'
