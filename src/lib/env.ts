import { arc, arcTestnet } from 'viem/chains'
import { isAddress, type Address } from 'viem'

/**
 * App configuration, read from Vite env variables so the same build can point at
 * mainnet later:
 *   VITE_CHAIN             testnet | mainnet (default testnet)
 *   VITE_JOBS_ADDRESS      PayOnProofJobs address on that network
 *   VITE_JOBS_DEPLOY_BLOCK block the contract was deployed in
 */
const rawChain = (import.meta.env.VITE_CHAIN as string | undefined)?.trim().toLowerCase() || 'testnet'
const rawAddress = (import.meta.env.VITE_JOBS_ADDRESS as string | undefined)?.trim() ?? ''
const rawBlock = (import.meta.env.VITE_JOBS_DEPLOY_BLOCK as string | undefined)?.trim() ?? ''

function findError(): string | null {
  if (rawChain !== 'testnet' && rawChain !== 'mainnet') return `VITE_CHAIN must be "testnet" or "mainnet" (got "${rawChain}").`
  if (!isAddress(rawAddress)) return 'VITE_JOBS_ADDRESS is missing or not a valid address.'
  if (!/^\d+$/.test(rawBlock)) return 'VITE_JOBS_DEPLOY_BLOCK is missing or not a block number.'
  return null
}

export const configError = findError()
export const isMainnet = rawChain === 'mainnet'
export const appChain = isMainnet ? arc : arcTestnet
export const JOBS_ADDRESS = rawAddress as Address
export const DEPLOY_BLOCK = /^\d+$/.test(rawBlock) ? BigInt(rawBlock) : 0n
export const NETWORK_NAME = appChain.name
