import { SUPPORTED_COUNTRIES } from './countries.mts'

export const COUNTRY_SELECT_OPTIONS = SUPPORTED_COUNTRIES.map(country => ({
  value: country.code,
  label: country.name,
}))
