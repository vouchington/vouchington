import { createElectionGetter } from '../shared/entity-service.mts'
import { TOPIC_ELECTION_CONFIG } from './config.mts'
import type { ViewTopicElection } from './types.mts'

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/elections-votes/README.md`.
 */
export const getTopicElectionById = createElectionGetter<ViewTopicElection>(TOPIC_ELECTION_CONFIG)
