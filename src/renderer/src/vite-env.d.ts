/// <reference types="vite/client" />

import type { LoopifyApi } from "../../shared/contracts/ipc"

declare global {
  interface Window {
    loopify: LoopifyApi
  }
}
