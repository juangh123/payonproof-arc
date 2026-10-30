import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { hexToString, type Hex } from 'viem'
import type { StoredEvent } from '@/lib/eventStore'
import { appChain } from '@/lib/env'
import { shortAddr, usdc, isZeroHash, shortHash } from '@/lib/format'
import { TxLink } from './ui'

function reasonText(h: string): string | null {
  if (isZeroHash(h as Hex)) return null
  try {
    const s = hexToString(h as Hex, { size: 32 }).replace(/\0+$/, '')
    return /^[\x20-\x7e]+$/.test(s) ? `"${s}"` : shortHash(h)
  } catch {
    return shortHash(h)
  }
}

function describe(e: StoredEvent): { title: string; detail?: string } {
  const a = e.args
  switch (e.name) {
    case 'JobCreated':
      return { title: 'Job created', detail: `Client ${shortAddr(a.client)}, expires ${new Date(Number(a.expiredAt) * 1000).toLocaleString()}` }
    case 'ProviderSet':
      return { title: 'Provider set', detail: shortAddr(a.provider) }
    case 'BudgetSet':
      return { title: 'Budget set', detail: usdc(BigInt(a.amount)) }
    case 'JobFunded':
      return { title: 'Escrow funded', detail: usdc(BigInt(a.amount)) }
    case 'JobSubmitted':
      return { title: 'Delivery submitted', detail: shortHash(a.deliverable) }
    case 'JobCompleted':
      return { title: 'Completed by evaluator', detail: reasonText(a.reason) ?? undefined }
    case 'PaymentReleased':
      return { title: 'Payment released', detail: `${usdc(BigInt(a.amount))} to ${shortAddr(a.provider)}` }
    case 'JobRejected':
      return { title: 'Rejected', detail: [`By ${shortAddr(a.rejector)}`, reasonText(a.reason)].filter(Boolean).join(', ') }
    case 'Refunded':
      return { title: 'Client refunded', detail: `${usdc(BigInt(a.amount))} to ${shortAddr(a.client)}` }
    case 'JobExpired':
      return { title: 'Expired, refund claimed' }
  }
}

export function Timeline({ events }: { events: StoredEvent[] }) {
  const client = usePublicClient({ chainId: appChain.id })
  const blocks = useMemo(() => [...new Set(events.map((e) => e.blockNumber))], [events])
  const { data: times } = useQuery({
    queryKey: ['block-times', blocks.join(',')],
    enabled: !!client && blocks.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const out: Record<string, number> = {}
      await Promise.all(
        blocks.map(async (b) => {
          const block = await client!.getBlock({ blockNumber: BigInt(b) })
          out[b] = Number(block.timestamp)
        }),
      )
      return out
    },
  })

  if (events.length === 0) return <p className="text-sm text-muted">No events yet.</p>
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {events.map((e) => {
        const d = describe(e)
        const t = times?.[e.blockNumber]
        return (
          <li key={`${e.txHash}:${e.logIndex}`} className="relative">
            <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-accent" aria-hidden />
            <p className="text-sm font-semibold text-ink">{d.title}</p>
            {d.detail && <p className="text-sm tabular-nums text-muted">{d.detail}</p>}
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-subtle">
              {t && <span>{new Date(t * 1000).toLocaleString()}</span>}
              <TxLink hash={e.txHash} />
            </p>
          </li>
        )
      })}
    </ol>
  )
}
