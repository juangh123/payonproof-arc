import { getPublicClient } from 'wagmi/actions'
import { parseEventLogs, type Hex } from 'viem'
import { config } from '@/config'
import { jobsAbi, type EventName } from './abi'
import { appChain, DEPLOY_BLOCK, JOBS_ADDRESS } from './env'

/**
 * Chain-only indexer. Scans the contract's logs from the deployment block up to the head in
 * chunks of at most 10,000 blocks, keeps the decoded events in memory and in localStorage,
 * and on later runs only scans the blocks it has not seen yet.
 */
export const MAX_LOG_RANGE = 10_000n
const PARALLEL = 4
const MIN_SPLIT = 500n

export interface StoredEvent {
  name: EventName
  jobId: string
  blockNumber: string
  logIndex: number
  txHash: Hex
  /** every decoded argument as a string (addresses, bigints, bytes32) */
  args: Record<string, string>
}

export interface IndexState {
  events: StoredEvent[]
  /** last block that has been fully scanned (DEPLOY_BLOCK - 1 before the first scan) */
  scannedTo: bigint
  head: bigint
  scanning: boolean
  error: string | null
  loaded: boolean
}

const CACHE_KEY = `payonproof:v1:${appChain.id}:${JOBS_ADDRESS.toLowerCase()}:${DEPLOY_BLOCK}`

function loadCache(): Pick<IndexState, 'events' | 'scannedTo'> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { events: StoredEvent[]; scannedTo: string }
      return { events: parsed.events, scannedTo: BigInt(parsed.scannedTo) }
    }
  } catch {
    /* ignore a corrupt cache */
  }
  return { events: [], scannedTo: DEPLOY_BLOCK - 1n }
}

function persist() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ events: state.events, scannedTo: state.scannedTo.toString() }))
  } catch {
    /* storage full or unavailable */
  }
}

const cached = loadCache()
let state: IndexState = {
  events: cached.events,
  scannedTo: cached.scannedTo,
  head: cached.scannedTo,
  scanning: false,
  error: null,
  loaded: false,
}
const listeners = new Set<() => void>()
const emit = (next: Partial<IndexState>) => {
  state = { ...state, ...next }
  listeners.forEach((l) => l())
}

export const subscribeIndex = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getIndexState = () => state

function toStored(log: ReturnType<typeof parseEventLogs<typeof jobsAbi>>[number]): StoredEvent {
  const args = (log as unknown as { args: Record<string, unknown> }).args ?? {}
  const flat: Record<string, string> = {}
  for (const [k, v] of Object.entries(args)) flat[k] = String(v)
  return {
    name: (log as { eventName: EventName }).eventName,
    jobId: flat.jobId ?? '0',
    blockNumber: String(log.blockNumber),
    logIndex: Number(log.logIndex),
    txHash: log.transactionHash,
    args: flat,
  }
}

async function fetchRange(from: bigint, to: bigint): Promise<StoredEvent[]> {
  const client = getPublicClient(config, { chainId: appChain.id })
  if (!client) throw new Error('No RPC client for this network')
  try {
    const logs = await client.getLogs({ address: JOBS_ADDRESS, fromBlock: from, toBlock: to })
    const parsed = parseEventLogs({ abi: jobsAbi, logs: logs })
    return parsed.map(toStored)
  } catch (err) {
    // The RPC may cap log ranges further than 10,000 blocks: split and retry.
    if (to - from < MIN_SPLIT) throw err
    const mid = from + (to - from) / 2n
    const left = await fetchRange(from, mid)
    const right = await fetchRange(mid + 1n, to)
    return [...left, ...right]
  }
}

let running: Promise<void> | null = null

export function syncEvents(): Promise<void> {
  if (running) return running
  running = (async () => {
    emit({ scanning: true, error: null })
    try {
      const client = getPublicClient(config, { chainId: appChain.id })
      if (!client) throw new Error('No RPC client for this network')
      const head = await client.getBlockNumber()
      emit({ head })
      let next = state.scannedTo + 1n
      while (next <= head) {
        const ranges: Array<[bigint, bigint]> = []
        let cursor = next
        for (let i = 0; i < PARALLEL && cursor <= head; i++) {
          const end = cursor + MAX_LOG_RANGE - 1n > head ? head : cursor + MAX_LOG_RANGE - 1n
          ranges.push([cursor, end])
          cursor = end + 1n
        }
        const results = await Promise.all(ranges.map(([a, b]) => fetchRange(a, b)))
        const incoming = results.flat()
        const seen = new Set(state.events.map((e) => `${e.txHash}:${e.logIndex}`))
        const fresh = incoming.filter((e) => !seen.has(`${e.txHash}:${e.logIndex}`))
        const merged = [...state.events, ...fresh].sort(
          (a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || a.logIndex - b.logIndex,
        )
        const scannedTo = ranges[ranges.length - 1][1]
        emit({ events: merged, scannedTo })
        persist()
        next = cursor
      }
      emit({ loaded: true })
    } catch (err) {
      emit({ error: err instanceof Error ? err.message : 'Failed to read events', loaded: state.scannedTo >= DEPLOY_BLOCK })
    } finally {
      emit({ scanning: false })
      running = null
    }
  })()
  return running
}

// ---- derived helpers -------------------------------------------------------

export interface CreatedJob {
  jobId: bigint
  client: string
  provider: string
  evaluator: string
  expiredAt: bigint
  blockNumber: bigint
}

/** Jobs from JobCreated events, with providers assigned later by ProviderSet applied. Newest first. */
export function createdJobs(events: StoredEvent[]): CreatedJob[] {
  const providers = new Map<string, string>()
  for (const e of events) if (e.name === 'ProviderSet') providers.set(e.jobId, e.args.provider)
  return events
    .filter((e) => e.name === 'JobCreated')
    .map((e) => ({
      jobId: BigInt(e.jobId),
      client: e.args.client,
      provider: providers.get(e.jobId) ?? e.args.provider,
      evaluator: e.args.evaluator,
      expiredAt: BigInt(e.args.expiredAt),
      blockNumber: BigInt(e.blockNumber),
    }))
    .sort((a, b) => (a.jobId < b.jobId ? 1 : -1))
}
