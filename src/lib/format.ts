import { formatUsdc } from '@/onchain-money'
import { buildTxExplorerUrl, buildAddressExplorerUrl } from '@/onchain-facts'
import { appChain } from './env'
import type { Address, Hex } from 'viem'
import { zeroHash } from 'viem'

export const STATUS_NAMES = ['Open', 'Funded', 'Submitted', 'Completed', 'Rejected', 'Expired'] as const
export type StatusName = (typeof STATUS_NAMES)[number]
export const Status = { Open: 0, Funded: 1, Submitted: 2, Completed: 3, Rejected: 4, Expired: 5 } as const

export interface Job {
  id: bigint
  client: Address
  provider: Address
  evaluator: Address
  description: string
  budget: bigint
  expiredAt: bigint
  status: number
  hook: Address
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`
export const isZeroAddr = (a: string) => /^0x0{40}$/i.test(a)
export const sameAddr = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
export const isZeroHash = (h: Hex) => h === zeroHash

/** USDC amount, e.g. "12.5 USDC". Trailing zeros trimmed down to 2 decimals. */
export function usdc(raw: bigint): string {
  const s = formatUsdc(raw)
  const [whole, frac = ''] = s.split('.')
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0')
  return `${Number(whole).toLocaleString('en-US')}.${trimmed} USDC`
}

export const txUrl = (hash: string) => buildTxExplorerUrl(appChain.id, hash)
export const addrUrl = (addr: string) => buildAddressExplorerUrl(appChain.id, addr)

export function formatDateTime(unixSeconds: bigint | number): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "2d 3h", "4m 10s", or "expired". */
export function countdown(expiredAt: bigint, nowSec: number): string {
  const left = Number(expiredAt) - nowSec
  if (left <= 0) return 'Expired'
  const d = Math.floor(left / 86400)
  const h = Math.floor((left % 86400) / 3600)
  const m = Math.floor((left % 3600) / 60)
  const s = left % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${String(s).padStart(2, '0')}s`
}

/** Short reason text -> bytes32 (utf8, right padded). Returns null if it does not fit. */
export function utf8Size(s: string): number {
  return new TextEncoder().encode(s).length
}
