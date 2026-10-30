import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react'
import { cx } from '@/lib/cx'
import { addrUrl, shortAddr, shortHash, txUrl } from '@/lib/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-white text-ink border border-line-strong hover:bg-surface',
  ghost: 'bg-transparent text-accent-hover hover:bg-surface',
  danger: 'bg-white text-danger border border-danger/40 hover:bg-danger/5',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  full?: boolean
}

export function Button({ variant = 'primary', loading, full, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-45 active:scale-[0.99]',
        VARIANT[variant],
        full && 'w-full',
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-line bg-white p-4 sm:p-5', className)}>{children}</section>
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="display text-lg font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{children}</span>
      {hint && <span className="text-xs text-subtle">{hint}</span>}
    </div>
  )
}

export const inputClass =
  'w-full min-h-11 rounded-xl border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-subtle focus:border-accent-hover focus:outline-none'

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: ReactNode }) {
  const styles = {
    info: 'bg-surface text-ink-2',
    error: 'bg-danger/10 text-danger',
    success: 'bg-success/10 text-success',
    warn: 'bg-warn/10 text-warn',
  }[tone]
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return (
    <div className={cx('flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm', styles)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-pretty">{children}</div>
    </div>
  )
}

export function AddressLink({ address, label }: { address: string; label?: string }) {
  return (
    <a
      href={addrUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="mono inline-flex items-center gap-1 text-xs text-accent-hover hover:underline"
      title={address}
    >
      {label ?? shortAddr(address)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="mono inline-flex items-center gap-1 text-xs text-accent-hover hover:underline"
    >
      {label ?? shortHash(hash)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}
