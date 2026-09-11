import Template from './renewal-price-increase.tsx'
import type { EmailRenderResultPromise, RenewalPriceIncreaseEmailProps } from './types.mts'
export function renderRenewalPriceIncreaseEmail(
  props: RenewalPriceIncreaseEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
