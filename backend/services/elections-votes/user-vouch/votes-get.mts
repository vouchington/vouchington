import { createVoteGetByUser } from '../shared/entity-service.mts'
import { USER_VOUCH_ELECTION_CONFIG } from './config.mts'

export const getUserVouchElectionVote = createVoteGetByUser(USER_VOUCH_ELECTION_CONFIG)
