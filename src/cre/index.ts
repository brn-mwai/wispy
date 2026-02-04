/**
 * Chainlink CRE Module
 *
 * Chainlink Runtime Environment workflows for Wispy
 */

export {
  createDeFiMonitorWorkflow,
  createPriceAlertWorkflow,
  createOnChainActionWorkflow,
  createTrustBridgeWorkflow,
  generateCREConfig,
  simulateWorkflow,
  type CREConfig,
  type CRETrigger,
  type CREHandler,
  type CRERuntime,
  type CRENodeRuntime,
  type CREResult,
  type CREProjectConfig,
} from "./workflows.js";
