/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
registerChain(arc.id, arc.rpcUrls.default.http[0])

// Every chain's public RPC endpoints, tried in order.
const transportFor = (urls: readonly string[]) => fallback(urls.map((u) => http(u)))

export const config = createConfig({
  chains: [arcTestnet, arc],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: transportFor(arcTestnet.rpcUrls.default.http),
    [arc.id]: transportFor(arc.rpcUrls.default.http),
  },
})
