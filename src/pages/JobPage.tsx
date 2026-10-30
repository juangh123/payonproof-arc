import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { useIndex, useJob, useNow } from '@/hooks/useChainData'
import { syncEvents } from '@/lib/eventStore'
import { Status, countdown, formatDateTime, isZeroAddr, isZeroHash, usdc } from '@/lib/format'
import { AddressLink, Card, Notice, SectionTitle, Spinner } from '@/components/ui'
import { StatusBadge } from '@/components/StatusBadge'
import { JobActions } from '@/components/JobActions'
import { VerifyDelivery } from '@/components/VerifyDelivery'
import { Timeline } from '@/components/Timeline'
import { IndexProgress } from '@/components/JobRow'

export default function JobPage() {
  const { id: idParam } = useParams()
  const id = idParam && /^[1-9]\d*$/.test(idParam) ? BigInt(idParam) : undefined
  const { job, deliverable, isLoading, error, refetch } = useJob(id)
  const { events } = useIndex()
  const now = useNow()

  const jobEvents = useMemo(() => events.filter((e) => id !== undefined && e.jobId === id.toString()), [events, id])

  if (id === undefined) return <Notice tone="error">That is not a valid job ID.</Notice>
  if (isLoading) return <Spinner label={`Loading job #${id}…`} />
  if (error || !job) {
    return (
      <div className="space-y-3">
        <Notice tone="error">Job #{id.toString()} was not found on this network.</Notice>
        <Link to="/" className="text-sm font-semibold text-accent-hover hover:underline">
          Back to home
        </Link>
      </div>
    )
  }

  const live = job.status === Status.Funded || job.status === Status.Submitted
  const expired = now >= Number(job.expiredAt)
  const hasDelivery = deliverable !== undefined && !isZeroHash(deliverable)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono text-xs text-subtle">Job #{job.id.toString()}</p>
          <h1 className="display mt-0.5 text-balance text-2xl font-bold leading-snug [overflow-wrap:anywhere]">{job.description || 'Untitled job'}</h1>
        </div>
        <StatusBadge status={job.status} />
      </div>

      <Card className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Budget</p>
          <p className="display text-4xl font-bold tabular-nums">{job.budget > 0n ? usdc(job.budget) : 'Not set'}</p>
          <p className="mt-1 text-sm text-muted">
            {job.status === Status.Completed && 'Paid to the provider.'}
            {job.status === Status.Rejected && 'Rejected. Any escrowed USDC went back to the client.'}
            {job.status === Status.Expired && 'Expired. The escrowed USDC went back to the client.'}
            {live && 'Held in escrow by the contract.'}
            {job.status === Status.Open && 'Not funded yet.'}
          </p>
        </div>
        <dl className="grid gap-3 border-t border-line pt-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Client</dt>
            <dd><AddressLink address={job.client} /></dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Provider</dt>
            <dd>{isZeroAddr(job.provider) ? <span className="text-subtle">Not set</span> : <AddressLink address={job.provider} />}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Evaluator</dt>
            <dd><AddressLink address={job.evaluator} /></dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">Expires</dt>
            <dd className="flex items-center gap-1.5 text-right tabular-nums">
              <Clock className="size-3.5 text-subtle" aria-hidden />
              <span>{formatDateTime(job.expiredAt)}</span>
              {(live || job.status === Status.Open) && (
                <span className={expired && live ? 'font-semibold text-danger' : 'text-muted'}>({countdown(job.expiredAt, now)})</span>
              )}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted">Deliverable</dt>
            <dd className="mono min-w-0 break-all text-right text-xs">{hasDelivery ? deliverable : <span className="text-subtle">Nothing submitted</span>}</dd>
          </div>
        </dl>
      </Card>

      <Notice>
        The evaluator is trusted once work is submitted, as in ERC-8183. The contract stores only a hash of the delivery and cannot judge the work: the evaluator
        decides whether the provider is paid or the client is refunded. If nobody settles before expiry, anyone can refund the client.
      </Notice>

      <JobActions
        job={job}
        onDone={async () => {
          await refetch()
          await syncEvents()
        }}
      />

      <VerifyDelivery deliverable={deliverable} />

      <section>
        <SectionTitle>Timeline</SectionTitle>
        <IndexProgress />
        <Card className="mt-2">
          <Timeline events={jobEvents} />
        </Card>
      </section>
    </div>
  )
}
