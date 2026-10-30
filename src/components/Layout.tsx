import { cx } from '@/lib/cx'
import { NavLink, Outlet } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { ShieldCheck, Wallet } from 'lucide-react'
import { appChain, JOBS_ADDRESS, NETWORK_NAME } from '@/lib/env'
import { addrUrl, shortAddr } from '@/lib/format'
import { friendlyError } from '@/lib/errors'
import { useState } from 'react'
import { Button } from './ui'

function WalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, show, address }) => (
        <button
          onClick={show}
          className={cx(
            'inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors',
            isConnected ? 'border border-line-strong bg-white text-ink hover:bg-surface' : 'bg-accent text-white hover:bg-accent-hover',
          )}
        >
          <Wallet className="size-4" aria-hidden />
          <span className={isConnected ? 'mono text-xs' : undefined}>{isConnected && address ? shortAddr(address) : 'Connect wallet'}</span>
        </button>
      )}
    </ConnectKitButton.Custom>
  )
}

/** Shown when a wallet is connected on a different network than the app's. */
function NetworkBanner() {
  const { isConnected, chainId } = useAccount()
  const { switchChainAsync, isPending } = useSwitchChain()
  const [err, setErr] = useState<string | null>(null)
  if (!isConnected || chainId === appChain.id) return null
  return (
    <div className="border-b border-warn/30 bg-warn/10">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm text-warn">
        <span>{err ?? `Wrong network. Switch your wallet to ${NETWORK_NAME} to make changes.`}</span>
        <Button
          variant="secondary"
          className="min-h-9"
          loading={isPending}
          onClick={() => {
            setErr(null)
            switchChainAsync({ chainId: appChain.id }).catch((e: unknown) => setErr(friendlyError(e).message))
          }}
        >
          Switch to {NETWORK_NAME}
        </Button>
      </div>
    </div>
  )
}

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/create', label: 'Create job', end: false },
  { to: '/my-jobs', label: 'My jobs', end: false },
]

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2" aria-label="PayOnProof home">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <span className="display text-lg font-bold text-ink">PayOnProof</span>
          </NavLink>
          <WalletButton />
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 pb-2" aria-label="Main">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 text-sm font-semibold transition-colors',
                  isActive ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <NetworkBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-white pb-24">
      <div className="mx-auto max-w-3xl space-y-2 px-4 py-6 text-xs text-muted">
        <p className="font-semibold text-warn">Unaudited. Use small amounts.</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Network: {NETWORK_NAME}</span>
          <span aria-hidden>·</span>
          <span>Contract</span>
          <a
            href={addrUrl(JOBS_ADDRESS)}
            target="_blank"
            rel="noopener noreferrer"
            className="mono break-all text-accent-hover hover:underline"
          >
            {JOBS_ADDRESS}
          </a>
        </p>
        <p>
          <NavLink to="/deploy" className="font-semibold text-accent-hover hover:underline">
            Deploy your own
          </NavLink>
        </p>
        <p>
          Built with{' '}
          <a href="https://studio.arc.io" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink hover:underline">
            Arc Studio
          </a>
        </p>
      </div>
    </footer>
  )
}
