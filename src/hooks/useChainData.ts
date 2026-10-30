import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useReadContract, useReadContracts } from 'wagmi'
import { getIndexState, subscribeIndex, syncEvents } from '@/lib/eventStore'
import { jobsAbi } from '@/lib/abi'
import { appChain, JOBS_ADDRESS } from '@/lib/env'
import type { Job } from '@/lib/format'

/** Live view of the event index. Starts a scan on first use and refreshes it every few seconds. */
export function useIndex() {
  const state = useSyncExternalStore(subscribeIndex, getIndexState)
  useEffect(() => {
    void syncEvents()
    const t = setInterval(() => {
      if (!document.hidden) void syncEvents()
    }, 8000)
    return () => clearInterval(t)
  }, [])
  return state
}

/** Unix seconds, ticking once a second. */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

/** getJob for many ids in one multicall. */
export function useJobs(ids: bigint[]) {
  const key = ids.map(String).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => ids, [key])
  const query = useReadContracts({
    contracts: stable.map((id) => ({
      address: JOBS_ADDRESS,
      abi: jobsAbi,
      functionName: 'getJob' as const,
      args: [id] as const,
      chainId: appChain.id,
    })),
    query: { enabled: stable.length > 0, refetchInterval: 8000 },
  })
  const jobs = useMemo(() => {
    const map = new Map<string, Job>()
    query.data?.forEach((r) => {
      if (r.status === 'success') {
        const j = r.result
        map.set(j.id.toString(), j)
      }
    })
    return map
  }, [query.data])
  return { jobs, isLoading: query.isLoading, refetch: query.refetch }
}

/** One job plus its deliverable hash. */
export function useJob(id: bigint | undefined) {
  const enabled = id !== undefined
  const job = useReadContract({
    address: JOBS_ADDRESS,
    abi: jobsAbi,
    functionName: 'getJob',
    args: [id ?? 0n],
    chainId: appChain.id,
    query: { enabled, refetchInterval: 5000, retry: 1 },
  })
  const deliverable = useReadContract({
    address: JOBS_ADDRESS,
    abi: jobsAbi,
    functionName: 'deliverableOf',
    args: [id ?? 0n],
    chainId: appChain.id,
    query: { enabled, refetchInterval: 5000, retry: 1 },
  })
  return {
    job: job.data,
    deliverable: deliverable.data,
    isLoading: job.isLoading,
    error: job.error,
    refetch: async () => {
      await Promise.all([job.refetch(), deliverable.refetch()])
    },
  }
}
