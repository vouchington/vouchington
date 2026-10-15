import { background } from '@queues/background/queues'

// The domain's queue is the shared `background` queue; this names it for the domain's own code.
export const postPublicationQueue = background
