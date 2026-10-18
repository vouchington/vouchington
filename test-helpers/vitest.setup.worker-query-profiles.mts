import { setTestWorkerProcessorDecorator } from '../backend/data-stores/valkey-glide-mq/test-worker-processor-decorator.mts'
import { wrapRequestQueryProfileProcessor } from './request-query-profile-worker.mts'

setTestWorkerProcessorDecorator(wrapRequestQueryProfileProcessor)
