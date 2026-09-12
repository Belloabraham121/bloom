/**
 * Public market ingest surface for the app.
 * Poller only — never import @substreams/* from Next routes.
 */

export {
  pollSubgraphMarketOnce,
  startMarketPoller,
  type StreamHandle,
} from "./poller"

export { tryParseUniswapSwapLog } from "./uniswap-mapper"
export {
  isSubstreamsConfigured,
  getSubstreamsToken,
  getSubstreamsEndpoint,
  SUBSTREAMS_DEFAULTS,
} from "./config"
