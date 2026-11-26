import { seedMediaDeliveryReplay } from './seed-data/media-delivery-replay.mts'
import { runMediaDeliveryReplayScenarios } from './run-scenarios/media-delivery-replay.mts'
import {
  runMediaDeliveryScopedPageScenarios,
  runMediaDeliveryGlobalPageScenarios,
} from './run-scenarios/media-delivery-global-pages.mts'
import { runMediaDeliveryPopularImageScenario } from './run-scenarios/media-delivery-popular-image.mts'

export const MEDIA_DELIVERY_RUNNERS: readonly (() => Promise<unknown>)[] = [
  seedMediaDeliveryReplay,
  runMediaDeliveryReplayScenarios,
  runMediaDeliveryScopedPageScenarios,
  runMediaDeliveryGlobalPageScenarios,
  runMediaDeliveryPopularImageScenario,
]
