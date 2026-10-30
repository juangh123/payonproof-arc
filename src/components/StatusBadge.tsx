import { cx } from '@/lib/cx'
import { STATUS_NAMES } from '@/lib/format'


const TONE: Record<string, string> = {
  Open: 'bg-surface text-ink-2',
  Funded: 'bg-accent-hover/10 text-accent-hover',
  Submitted: 'bg-warn/10 text-warn',
  Completed: 'bg-success/10 text-success',
  Rejected: 'bg-danger/10 text-danger',
  Expired: 'bg-surface text-muted',
}

export function StatusBadge({ status }: { status: number }) {
  const name = STATUS_NAMES[status] ?? 'Unknown'
  return (
    <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', TONE[name] ?? TONE.Open)}>
      {name}
    </span>
  )
}
