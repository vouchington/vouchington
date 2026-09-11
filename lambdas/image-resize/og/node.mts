// Plain object-literal node shape satori accepts in place of JSX.
// `erasableSyntaxOnly` in lambdas/tsconfig.json forbids JSX syntax (it is not
// erasable — it requires real transformation), and satori's own object-literal
// API makes JSX unnecessary here, so this lambda adds no `react`/JSX tooling.
export interface SatoriNode {
  type: string
  props: {
    style?: Record<string, string | number>
    children?: SatoriNode | SatoriNode[] | string
    src?: string
    width?: number
    height?: number
  }
}
