import { assertBackendRowContracts } from './backend-row-contracts.mts'
import { loadBackendProgram } from './backend-program.mts'

assertBackendRowContracts(loadBackendProgram().program)
console.log('PostgreSQL row contracts verified')
