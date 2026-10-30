import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { createdJobs } from '@/lib/eventStore'
import { sameAddr } from '@/lib/format'
import type { Job } from '@/lib/format'
import { useIndex, useJobs } from '@/hooks/useChainData'
import { Card, Notice, SectionTitle } from '@/components/ui'
import { IndexProgress, JobRow } from '@/components/JobRow'
import { ConnectKitButton } from 'connectkit'

type Role = 'client' | 'provider' | 'evaluator'
const ROLES: Array<{ role: Role; title: string; empty: string }> = [
  { role: 'client', title: 'As client', empty: 'You have not created any jobs with this wallet.' },
  { role: 'provider', title: 'As provider', empty: 'No jobs are assigned to this wallet as provider.' },
  { role: 'evaluator', title: 'As evaluator', empty: 'No jobs are waiting on this wallet as evaluator.' },
]

export default function MyJobs() {
  const { address } = useAccount()
  const { events, loaded, scanning } = useIndex()

  const ids = useMemo(() => {
    if (!address) return []
    return createdJobs(events)
      .filter((j) => sameAddr(j.client, address) || sameAddr(j.provider, address) || sameAddr(j.evaluator, address))
      .slice(0, 100)
      .map((j) => j.jobId)
  }, [events, address])
  const { jobs } = useJobs(ids)

  if (!address) {
    return (
      <div className="space-y-4">
        <h1 className="display text-2xl font-bold">My jobs</h1>
        <Notice>Connect a wallet to see the jobs where you are client, provider or evaluator.</Notice>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              Connect wallet
            </button>
          )}
        </ConnectKitButton.Custom>
      </div>
    )
  }

  const all = ids.map((id) => jobs.get(id.toString())).filter((j): j is Job => !!j)
  const inRole = (role: Role) => all.filter((j) => sameAddr(j[role], address))

  return (
    <div className="space-y-6">
      <h1 className="display text-2xl font-bold">My jobs</h1>
      <IndexProgress />
      {ROLES.map(({ role, title, empty }) => {
        const list = inRole(role)
        return (
          <section key={role}>
            <SectionTitle aside={<span className="text-xs tabular-nums text-muted">{list.length}</span>}>{title}</SectionTitle>
            <Card className="p-1.5 sm:p-2">
              {list.length === 0 ? (
                <p className="p-3 text-sm text-muted">{loaded && !scanning ? empty : 'Loading from the chain…'}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {list.map((j) => (
                    <li key={j.id.toString()}>
                      <JobRow job={j} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        )
      })}
    </div>
  )
}
