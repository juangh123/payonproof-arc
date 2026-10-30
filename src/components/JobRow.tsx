import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Job } from '@/lib/format'
import { usdc } from '@/lib/format'
import { StatusBadge } from './StatusBadge'
import { useIndex } from '@/hooks/useChainData'
import { DEPLOY_BLOCK } from '@/lib/env'
import { Notice } from './ui'

export function JobRow({ job }: { job: Job }) {
  return (
    <Link
      to={`/job/${job.id}`}
      className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface"
    >
      <span className="mono w-10 shrink-0 text-xs text-subtle">#{job.id.toString()}</span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-sm font-medium text-ink">{job.description || 'Untitled job'}</span>
        <span className="mt-0.5 block text-xs tabular-nums text-muted">{job.budget > 0n ? usdc(job.budget) : 'Budget not set'}</span>
      </span>
      <StatusBadge status={job.status} />
      <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
    </Link>
  )
}

/** Honest indexing status: block numbers and blocks remaining, never a fake percentage. */
export function IndexProgress() {
  const { scanning, scannedTo, head, error, loaded } = useIndex()
  const remaining = head > scannedTo ? head - scannedTo : 0n
  if (error) {
    return <Notice tone="warn">Could not read the latest events ({error}). Showing what was loaded so far. It retries automatically.</Notice>
  }
  if (!scanning && loaded) return null
  if (!scanning) return null
  const done = scannedTo >= DEPLOY_BLOCK ? scannedTo - DEPLOY_BLOCK + 1n : 0n
  return (
    <p className="text-xs tabular-nums text-muted" aria-live="polite">
      Reading the chain: scanned {done.toLocaleString()} blocks since deployment, {remaining.toLocaleString()} left to head {head.toLocaleString()}.
    </p>
  )
}
