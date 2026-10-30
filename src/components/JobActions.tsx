import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { stringToHex, zeroHash, type Hex } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { jobsAbi } from '@/lib/abi'
import { JOBS_ADDRESS } from '@/lib/env'
import { Status, sameAddr, utf8Size, type Job } from '@/lib/format'
import { useTx, type TxCall } from '@/hooks/useTx'
import { useNow } from '@/hooks/useChainData'
import { Button, Card, Label, Notice, TxLink, inputClass } from './ui'
import { HashInput } from './HashInput'

/** Only the actions this wallet can take right now are rendered. */
export function JobActions({ job, onDone }: { job: Job; onDone: () => Promise<void> }) {
  const { address, isConnected } = useAccount()
  const tx = useTx()
  const now = useNow()
  const [reason, setReason] = useState('')
  const [hash, setHash] = useState<Hex | null>(null)
  const [last, setLast] = useState<{ label: string; hash: string } | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const isClient = sameAddr(job.client, address)
  const isProvider = sameAddr(job.provider, address)
  const isEvaluator = sameAddr(job.evaluator, address)
  const expired = now >= Number(job.expiredAt)
  const live = job.status === Status.Funded || job.status === Status.Submitted
  const reasonTooLong = utf8Size(reason) > 32
  const reasonHex = reason ? stringToHex(reason.slice(0, 32), { size: 32 }) : zeroHash

  const canCancel = job.status === Status.Open && isClient
  const canSubmit = job.status === Status.Funded && isProvider && !expired
  const canComplete = job.status === Status.Submitted && isEvaluator
  const canReject = live && isEvaluator
  const canRefund = live && expired
  const anything = canCancel || canSubmit || canComplete || canReject || canRefund

  const act = async (label: string, call: TxCall) => {
    setPending(label)
    setLast(null)
    const r = await tx.send(call)
    setPending(null)
    if (r) setLast({ label, hash: r.hash })
    await onDone()
  }
  const base = { address: JOBS_ADDRESS, abi: jobsAbi } as const
  const id = job.id

  if (!isConnected) {
    return (
      <Card className="space-y-3">
        <p className="text-sm text-muted">Connect your wallet to see what you can do on this job.</p>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button onClick={show} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              Connect wallet
            </button>
          )}
        </ConnectKitButton.Custom>
        {canRefund && <Notice tone="info">This job has expired. Once connected, anyone can refund the client.</Notice>}
      </Card>
    )
  }

  if (!anything && !last) {
    return (
      <Card>
        <p className="text-sm text-muted">No actions are available for this wallet on this job right now.</p>
      </Card>
    )
  }

  const busy = tx.busy
  const status = (label: string) => (pending === label ? (tx.phase === 'wallet' ? 'Confirm in wallet…' : 'Confirming…') : null)

  return (
    <Card className="space-y-4">
      <h2 className="display text-lg font-semibold">Your actions</h2>

      {canSubmit && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Submit delivery</p>
          <HashInput idPrefix="submit" onHash={setHash} />
          <Button full disabled={!hash || busy} loading={pending === 'Delivery submitted'} onClick={() => void (hash && act('Delivery submitted', { ...base, functionName: 'submit', args: [id, hash, '0x'] }))}>
            {status('Delivery submitted') ?? 'Submit delivery'}
          </Button>
        </div>
      )}

      {job.status === Status.Funded && isProvider && expired && (
        <Notice tone="warn">The job expired before a delivery was submitted. The client can be refunded.</Notice>
      )}

      {(canComplete || canReject) && (
        <div className="space-y-3">
          <div>
            <Label hint={`${utf8Size(reason)}/32 bytes`}>Reason (optional)</Label>
            <input className={inputClass} placeholder="Short note, stored as bytes32" value={reason} onChange={(e) => setReason(e.target.value)} />
            {reasonTooLong && <p className="mt-1 text-xs text-danger">The reason must fit in 32 bytes.</p>}
          </div>
          {canComplete && (
            <Button full disabled={busy || reasonTooLong} loading={pending === 'Job completed'} onClick={() => void act('Job completed', { ...base, functionName: 'complete', args: [id, reasonHex, '0x'] })}>
              {status('Job completed') ?? 'Complete and pay provider'}
            </Button>
          )}
          {canReject && (
            <Button full variant="danger" disabled={busy || reasonTooLong} loading={pending === 'Job rejected'} onClick={() => void act('Job rejected', { ...base, functionName: 'reject', args: [id, reasonHex, '0x'] })}>
              {status('Job rejected') ?? 'Reject and refund client'}
            </Button>
          )}
        </div>
      )}

      {canCancel && (
        <div className="space-y-2">
          <p className="text-sm text-muted">This job is not funded yet.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/create" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 text-sm font-semibold text-white hover:bg-accent-hover">
              Continue setup
            </Link>
            <Button variant="danger" disabled={busy} loading={pending === 'Job cancelled'} onClick={() => void act('Job cancelled', { ...base, functionName: 'reject', args: [id, zeroHash, '0x'] })}>
              {status('Job cancelled') ?? 'Cancel job'}
            </Button>
          </div>
        </div>
      )}

      {canRefund && (
        <div className="space-y-2">
          <p className="text-sm text-muted">This job has expired without being settled. Anyone can send the escrow back to the client.</p>
          <Button full variant="secondary" disabled={busy} loading={pending === 'Client refunded'} onClick={() => void act('Client refunded', { ...base, functionName: 'claimRefund', args: [id] })}>
            {status('Client refunded') ?? 'Refund client'}
          </Button>
        </div>
      )}

      {tx.error && <Notice tone="error">{tx.error}</Notice>}
      {last && (
        <Notice tone="success">
          <span className="block font-semibold">{last.label}. Confirmed and final.</span>
          <TxLink hash={last.hash} />
        </Notice>
      )}
    </Card>
  )
}
