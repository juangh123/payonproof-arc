import { cx } from '@/lib/cx'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, usePublicClient, useReadContract } from 'wagmi'
import { erc20Abi, isAddress, parseEventLogs, zeroAddress, type Address } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { getUsdc } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { jobsAbi } from '@/lib/abi'
import { appChain, JOBS_ADDRESS } from '@/lib/env'
import { createdJobs, syncEvents } from '@/lib/eventStore'
import { Status, sameAddr, usdc, utf8Size } from '@/lib/format'
import { useIndex, useJob, useJobs, useNow } from '@/hooks/useChainData'
import { useTx, type TxCall } from '@/hooks/useTx'
import { Button, Card, Label, Notice, AddressLink, inputClass } from '@/components/ui'
import { StepTracker, type TrackerStep } from '@/components/StepTracker'

const EXPIRY = [
  { key: '10m', label: '10 min', sec: 600 },
  { key: '1h', label: '1 hour', sec: 3600 },
  { key: '24h', label: '24 hours', sec: 86400 },
  { key: '7d', label: '7 days', sec: 604800 },
  { key: 'custom', label: 'Custom', sec: 0 },
] as const
type ExpiryKey = (typeof EXPIRY)[number]['key']
const MIN_CUSTOM_AHEAD = 6 * 60

function toBudget(text: string): bigint | null {
  if (!text.trim()) return null
  try {
    const v = parseUsdc(text.trim())
    return v > 0n ? v : null
  } catch {
    return null
  }
}

export default function CreateJob() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: appChain.id })
  const tx = useTx()
  const usdcAddr = getUsdc(appChain.id)?.address as Address
  const { events } = useIndex()

  // ---- form ----
  const [provider, setProvider] = useState('')
  const [evaluatorInput, setEvaluatorInput] = useState<string | null>(null)
  const [budgetText, setBudgetText] = useState('')
  const [expiryKey, setExpiryKey] = useState<ExpiryKey>('24h')
  const [custom, setCustom] = useState('')
  const [description, setDescription] = useState('')
  const evaluator = evaluatorInput ?? address ?? ''

  // ---- flow ----
  const draftKey = `payonproof:draft:${appChain.id}:${JOBS_ADDRESS.toLowerCase()}:${(address ?? '').toLowerCase()}`
  const [createdId, setCreatedId] = useState<bigint | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [hashes, setHashes] = useState<Record<string, string>>({})
  const [flowError, setFlowError] = useState<string | null>(null)

  // Resume: the draft id (this browser) plus the newest jobs this wallet created.
  const candidates = useMemo(() => {
    if (!address) return []
    const ids = createdJobs(events).filter((j) => sameAddr(j.client, address)).slice(0, 5).map((j) => j.jobId)
    const draft = localStorage.getItem(draftKey)
    if (draft && /^\d+$/.test(draft) && !ids.some((i) => i === BigInt(draft))) ids.push(BigInt(draft))
    return ids
  }, [events, address, draftKey])
  const { jobs: candidateJobs } = useJobs(candidates)
  const resumableId = useMemo(() => {
    if (dismissed || !address) return null
    const open = [...candidateJobs.values()]
      .filter((j) => j.status === Status.Open && sameAddr(j.client, address))
      .sort((a, b) => (a.id < b.id ? 1 : -1))[0]
    return open ? open.id : null
  }, [candidateJobs, dismissed, address])
  const activeId = createdId ?? resumableId
  const nowSec = useNow()

  const active = useJob(activeId ?? undefined)
  const job = activeId !== null ? active.job : undefined

  // ---- reads ----
  const balanceQ = useReadContract({
    address: usdcAddr,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address ?? zeroAddress],
    chainId: appChain.id,
    query: { enabled: !!address, refetchInterval: 10000 },
  })
  const allowanceQ = useReadContract({
    address: usdcAddr,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address ?? zeroAddress, JOBS_ADDRESS],
    chainId: appChain.id,
    query: { enabled: !!address, refetchInterval: 6000 },
  })
  const maxBudgetQ = useReadContract({ address: JOBS_ADDRESS, abi: jobsAbi, functionName: 'maxBudget', chainId: appChain.id })
  const balance = balanceQ.data
  const maxBudget = maxBudgetQ.data

  // ---- validation ----
  const parsedBudget = toBudget(budgetText)
  const customTs = custom ? Math.floor(new Date(custom).getTime() / 1000) : 0
  const problems: string[] = []
  if (!isAddress(provider)) problems.push(provider ? 'Provider is not a valid address.' : 'Enter the provider address.')
  else if (sameAddr(provider, address)) problems.push('The provider cannot be your own wallet (the client).')
  else if (sameAddr(provider, evaluator)) problems.push('The provider and the evaluator must be different addresses.')
  if (!isAddress(evaluator)) problems.push('Evaluator is not a valid address.')
  if (parsedBudget === null) problems.push('Enter a budget in USDC above zero (up to 6 decimals).')
  else if (maxBudget !== undefined && parsedBudget > maxBudget) problems.push(`The budget is above the per-job cap of ${usdc(maxBudget)}.`)
  else if (balance !== undefined && parsedBudget > balance) problems.push(`Insufficient USDC. You have ${usdc(balance)}.`)
  if (expiryKey === 'custom' && customTs < nowSec + MIN_CUSTOM_AHEAD) problems.push('Pick an expiry at least 6 minutes from now.')
  if (!description.trim()) problems.push('Add a short description.')
  if (utf8Size(description) > 280) problems.push('The description is over 280 bytes.')
  const formBlocked = problems.length > 0

  // ---- steps ----
  const budgetOnChain = job?.budget ?? 0n
  const allowance = allowanceQ.data ?? 0n
  const funded = !!job && job.status >= Status.Funded
  const done = {
    create: !!job,
    budget: funded || budgetOnChain > 0n,
    approve: funded || (budgetOnChain > 0n && allowance >= budgetOnChain),
    fund: funded,
  }
  const defs: Array<{ key: keyof typeof done; label: string; detail: string }> = [
    { key: 'create', label: 'Create job', detail: 'Records the job, provider, evaluator and expiry' },
    { key: 'budget', label: 'Set budget', detail: 'Records the USDC amount to escrow' },
    { key: 'approve', label: 'Approve USDC', detail: 'Allows exactly the budget, never unlimited' },
    { key: 'fund', label: 'Fund escrow', detail: 'Moves the budget into the contract' },
  ]
  const nextKey = defs.find((d) => !done[d.key])?.key
  const steps: TrackerStep[] = defs.map((d) => ({
    key: d.key,
    label: d.label,
    detail: d.detail,
    hash: hashes[d.key],
    state: done[d.key] ? 'done' : running === d.key ? 'running' : d.key === nextKey ? 'next' : 'pending',
  }))

  const readJob = async (id: bigint) =>
    (await publicClient!.readContract({ address: JOBS_ADDRESS, abi: jobsAbi, functionName: 'getJob', args: [id] }))

  const exec = async (key: string, call: TxCall) => {
    setRunning(key)
    const r = await tx.send(call)
    setRunning(null)
    if (r) setHashes((h) => ({ ...h, [key]: r.hash }))
    return r
  }

  const resumeBudget = job && budgetOnChain === 0n ? parsedBudget : null
  const canRun = activeId === null ? !formBlocked : !funded && (budgetOnChain > 0n || resumeBudget !== null)

  const run = async () => {
    if (!publicClient || !address || running) return
    setFlowError(null)
    tx.clearError()
    try {
      let id = activeId
      const budget = id !== null && job && budgetOnChain > 0n ? budgetOnChain : parsedBudget
      if (budget === null) return
      const bal = (await publicClient.readContract({ address: usdcAddr, abi: erc20Abi, functionName: 'balanceOf', args: [address] }))
      if (bal < budget) return setFlowError(`Insufficient USDC. You have ${usdc(bal)} but the budget is ${usdc(budget)}.`)

      if (id === null) {
        const expiredAt = expiryKey === 'custom' ? customTs : Math.floor(Date.now() / 1000) + (EXPIRY.find((e) => e.key === expiryKey)?.sec ?? 86400)
        const r = await exec('create', {
          address: JOBS_ADDRESS,
          abi: jobsAbi,
          functionName: 'createJob',
          args: [provider, evaluator, BigInt(expiredAt), description.trim(), zeroAddress],
        })
        if (!r) return
        const created = parseEventLogs({ abi: jobsAbi, logs: r.receipt.logs, eventName: 'JobCreated' })[0]
        if (!created) return setFlowError('The job was created but its ID could not be read. Check My jobs.')
        id = created.args.jobId
        localStorage.setItem(draftKey, id.toString())
        setCreatedId(id)
      }

      let j = await readJob(id)
      if (j.status !== Status.Open) return void (await active.refetch())
      if (Number(j.expiredAt) < Math.floor(Date.now() / 1000) + 30) {
        return setFlowError('This job is about to expire. Cancel it on the job page and create a new one with a longer expiry.')
      }
      if (j.budget === 0n) {
        if (!(await exec('budget', { address: JOBS_ADDRESS, abi: jobsAbi, functionName: 'setBudget', args: [id, budget, '0x'] }))) return
        j = await readJob(id)
      }
      if (j.budget !== budget) {
        return setFlowError(`The budget onchain is now ${usdc(j.budget)}, not ${usdc(budget)}. Review the job before funding.`)
      }
      const current = (await publicClient.readContract({
        address: usdcAddr,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, JOBS_ADDRESS],
      }))
      if (current < budget) {
        if (!(await exec('approve', { address: usdcAddr, abi: erc20Abi, functionName: 'approve', args: [JOBS_ADDRESS, budget] }))) return
      }
      const latest = await readJob(id)
      if (latest.budget !== budget) return setFlowError(`The budget changed to ${usdc(latest.budget)} while you were approving. Review the job before funding.`)
      await exec('fund', { address: JOBS_ADDRESS, abi: jobsAbi, functionName: 'fund', args: [id, budget, '0x'] })
    } catch {
      setFlowError('Something went wrong while sending. Your progress is saved onchain: press Continue to resume.')
    } finally {
      await Promise.all([active.refetch(), allowanceQ.refetch(), balanceQ.refetch()])
      void syncEvents()
    }
  }

  const reset = () => {
    localStorage.removeItem(draftKey)
    setCreatedId(null)
    setDismissed(true)
    setHashes({})
    setFlowError(null)
    tx.clearError()
    setProvider('')
    setBudgetText('')
    setDescription('')
  }

  const error = flowError ?? tx.error

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <h1 className="display text-2xl font-bold">Create a job</h1>
        <Notice>Connect your wallet to create and fund a job. You will be the client.</Notice>
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

  const actionLabel = funded
    ? 'Funded'
    : activeId === null
      ? Object.keys(hashes).length
        ? 'Retry'
        : 'Create job and fund escrow'
      : 'Continue'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">Create a job</h1>
        <p className="mt-1 text-sm text-muted">You are the client. Four transactions create the job and lock the USDC.</p>
      </div>

      {activeId === null ? (
        <Card className="space-y-4">
          <div>
            <Label>Provider address</Label>
            <input className={cx(inputClass, 'mono text-xs')} placeholder="0x…" value={provider} onChange={(e) => setProvider(e.target.value.trim())} spellCheck={false} />
          </div>
          <div>
            <Label hint={evaluatorInput === null ? 'defaults to your wallet' : undefined}>Evaluator address</Label>
            <input className={cx(inputClass, 'mono text-xs')} placeholder="0x…" value={evaluator} onChange={(e) => setEvaluatorInput(e.target.value.trim())} spellCheck={false} />
          </div>
          <div>
            <Label hint={balance !== undefined ? `Balance ${usdc(balance)}` : undefined}>Budget (USDC)</Label>
            <input className={cx(inputClass, 'tabular-nums')} inputMode="decimal" placeholder="0.00" value={budgetText} onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setBudgetText(e.target.value)} />
            {maxBudget !== undefined && <p className="mt-1 text-xs text-subtle">Per-job cap: {usdc(maxBudget)}</p>}
          </div>
          <div>
            <Label>Expires in</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Expiry">
              {EXPIRY.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={expiryKey === o.key}
                  onClick={() => setExpiryKey(o.key)}
                  className={cx(
                    'min-h-10 rounded-lg border px-3 text-sm font-medium transition-colors',
                    expiryKey === o.key ? 'border-accent bg-accent text-white' : 'border-line-strong bg-white text-ink hover:bg-surface',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {expiryKey === 'custom' && <input type="datetime-local" className={cx(inputClass, 'mt-2')} value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom expiry" />}
          </div>
          <div>
            <Label hint={`${utf8Size(description)}/280 bytes`}>Description</Label>
            <textarea className={cx(inputClass, 'min-h-24 py-2')} placeholder="What should be delivered?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {formBlocked && (provider || budgetText || description) && (
            <ul className="space-y-1.5">
              {problems.map((p) => (
                <li key={p}>
                  <Notice tone="warn">{p}</Notice>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Job #{activeId.toString()}</p>
            <Link to={`/job/${activeId}`} className="text-xs font-semibold text-accent-hover hover:underline">
              Open job page
            </Link>
          </div>
          {job ? (
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">Provider</dt><dd><AddressLink address={job.provider} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Evaluator</dt><dd><AddressLink address={job.evaluator} /></dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">Budget</dt><dd className="tabular-nums">{job.budget > 0n ? usdc(job.budget) : 'Not set yet'}</dd></div>
              <p className="text-pretty text-muted">{job.description}</p>
            </dl>
          ) : (
            <p className="text-sm text-muted">Reading the job from the chain…</p>
          )}
          {job && budgetOnChain === 0n && !funded && (
            <div>
              <Label>Budget (USDC)</Label>
              <input className={cx(inputClass, 'tabular-nums')} inputMode="decimal" placeholder="0.00" value={budgetText} onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setBudgetText(e.target.value)} />
            </div>
          )}
          {!funded && !running && (
            <button onClick={reset} className="text-xs font-semibold text-muted hover:text-ink hover:underline">
              Start a different job instead
            </button>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <StepTracker steps={steps} phase={tx.phase} />
        {error && <Notice tone="error">{error}</Notice>}
        {funded ? (
          <div className="space-y-3">
            <Notice tone="success">Escrow funded. The provider can now submit a delivery hash.</Notice>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to={`/job/${activeId}`} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
                Open job #{activeId?.toString()}
              </Link>
              <Button variant="secondary" onClick={reset}>Create another job</Button>
            </div>
          </div>
        ) : (
          <Button full onClick={() => void run()} disabled={!canRun || !!running} loading={!!running}>
            {running ? (tx.phase === 'wallet' ? 'Confirm in wallet…' : 'Confirming…') : actionLabel}
          </Button>
        )}
      </Card>
    </div>
  )
}
