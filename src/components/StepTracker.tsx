import { cx } from '@/lib/cx'
import { Check, Loader2 } from 'lucide-react'
import type { TxPhase } from '@/hooks/useTx'
import { TxLink } from './ui'

export type StepState = 'done' | 'next' | 'running' | 'pending'

export interface TrackerStep {
  key: string
  label: string
  detail?: string
  state: StepState
  hash?: string
}

export function StepTracker({ steps, phase }: { steps: TrackerStep[]; phase: TxPhase }) {
  return (
    <ol className="space-y-1" aria-label="Transaction steps">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-start gap-3 rounded-xl px-1 py-2">
          <span
            className={cx(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
              s.state === 'done' && 'bg-success text-white',
              s.state === 'running' && 'bg-accent text-white',
              s.state === 'next' && 'border-2 border-accent text-accent',
              s.state === 'pending' && 'border border-line-strong text-subtle',
            )}
          >
            {s.state === 'done' ? (
              <Check className="size-4" aria-hidden />
            ) : s.state === 'running' ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              i + 1
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx('block text-sm font-semibold', s.state === 'pending' ? 'text-subtle' : 'text-ink')}>{s.label}</span>
            <span className="block text-xs text-muted">
              {s.state === 'running'
                ? phase === 'wallet'
                  ? 'Confirm in your wallet…'
                  : 'Confirming onchain…'
                : s.state === 'done'
                  ? 'Confirmed'
                  : s.detail}
            </span>
            {s.hash && (
              <span className="mt-0.5 block">
                <TxLink hash={s.hash} />
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
