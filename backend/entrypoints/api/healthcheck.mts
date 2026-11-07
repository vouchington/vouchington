import { checkLocalHealth } from '@modules/utils/local-healthcheck'

process.exitCode = (await checkLocalHealth(Number(process.env.PORT) || 3000)) ? 0 : 1
