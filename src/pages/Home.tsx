import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, FileCheck2, Gavel, Hourglass, Landmark } from 'lucide-react'
import { createdJobs } from '@/lib/eventStore'
import { useIndex, useJobs } from '@/hooks/useChainData'
import { Button, Card, Notice, SectionTitle, inputClass } from '@/components/ui'
import { IndexProgress, JobRow } from '@/components/JobRow'

const STEPS = [
  { icon: Landmark, title: 'Client escrows USDC', body: 'The client sets a budget and locks it in the contract.' },
  { icon: FileCheck2, title: 'Provider submits a delivery hash', body: 'The provider posts a keccak256 fingerprint of the work.' },
  { icon: Gavel, title: 'Evaluator completes or rejects', body: 'Complete pays the provider. Reject refunds the client.' },
  { icon: Hourglass, title: 'Otherwise, refund after expiry', body: 'If nobody settles, anyone can refund the client once the job expires.' },
]

export default function Home() {
  const navigate = useNavigate()
  const [openById, setOpenById] = useState(false)
  const [idText, setIdText] = useState('')
  const { events, loaded, scanning } = useIndex()

  const latestIds = useMemo(() => createdJobs(events).slice(0, 20).map((j) => j.jobId), [events])
  const { jobs } = useJobs(latestIds)

  const idOk = /^[1-9]\d*$/.test(idText.trim())
  const go = (e: FormEvent) => {
    e.preventDefault()
    if (idOk) void navigate(`/job/${idText.trim()}`)
  }

  return (
    <div className="space-y-8">
      <section className="space-y-5">
        <h1 className="display text-balance text-3xl font-bold leading-tight text-ink sm:text-4xl">
          Pay for work only when proof of delivery arrives.
        </h1>
        <p className="max-w-[60ch] text-pretty text-muted">
          A USDC job escrow on Arc. No owner, no fees, no admin keys. Funds can never get stuck.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/create"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Create a job <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Button variant="secondary" onClick={() => setOpenById((v) => !v)} aria-expanded={openById}>
            Open job by ID
          </Button>
        </div>
        {openById && (
          <form onSubmit={go} className="flex gap-2">
            <input
              className={inputClass}
              inputMode="numeric"
              placeholder="Job ID, e.g. 1"
              value={idText}
              onChange={(e) => setIdText(e.target.value.replace(/\D/g, ''))}
              aria-label="Job ID"
              autoFocus
            />
            <Button type="submit" disabled={!idOk}>
              Open
            </Button>
          </form>
        )}
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-2xl border border-line p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-ink">
                <s.icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  <span className="tabular-nums text-subtle">{i + 1}. </span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-pretty text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <SectionTitle>Latest jobs</SectionTitle>
        <IndexProgress />
        <Card className="mt-2 p-1.5 sm:p-2">
          {latestIds.length === 0 ? (
            <div className="p-3">
              {loaded && !scanning ? (
                <Notice>No jobs yet. Be the first to create one.</Notice>
              ) : (
                <p className="text-sm text-muted">Loading jobs from the chain…</p>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {latestIds.map((id) => {
                const job = jobs.get(id.toString())
                return (
                  <li key={id.toString()}>
                    {job ? (
                      <JobRow job={job} />
                    ) : (
                      <Link to={`/job/${id}`} className="mono block px-3 py-4 text-xs text-subtle">
                        #{id.toString()} loading…
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </section>
    </div>
  )
}
