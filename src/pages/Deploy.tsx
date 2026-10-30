import { useState } from 'react'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { encodeDeployData, type Address, type Hex } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { Copy, Rocket } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import { buildAddressExplorerUrl, buildTxExplorerUrl, getUsdc } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { jobsAbi, jobsBytecode, jobsBytecodeHash } from '@/lib/abi'
import { feeOverrides } from '@/lib/fees'
import { friendlyError } from '@/lib/errors'
import { cx } from '@/lib/cx'
import { usdc } from '@/lib/format'
import { Button, Card, Label, Notice, inputClass } from '@/components/ui'

// ABI and creation bytecode come from src/generated/PayOnProofJobs.json, exported from the forge build
// of contracts/PayOnProofJobs.sol (bun run export-artifact). The build never reads contracts/out.
const TARGETS = [
  { chain: arcTestnet, envChain: 'testnet' },
  { chain: arc, envChain: 'mainnet' },
] as const
type Target = (typeof TARGETS)[number]

interface Deployed {
  chainId: number
  envChain: string
  address: Address
  hash: Hex
  block: bigint
  maxBudget: bigint
  token: Address
}

function EnvLine({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
      <code className="mono min-w-0 break-all text-xs text-ink">
        {k}={v}
      </code>
      <button
        type="button"
        aria-label={`Copy ${k}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink"
        onClick={() => void navigator.clipboard.writeText(`${k}=${v}`).then(() => toast.success('Copied'))}
      >
        <Copy className="size-4" aria-hidden />
      </button>
    </div>
  )
}

function ExtLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mono break-all text-xs text-accent-hover hover:underline">
      {children}
    </a>
  )
}

export default function Deploy() {
  const { isConnected, chainId } = useAccount()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const [target, setTarget] = useState<Target>(TARGETS[0])
  const publicClient = usePublicClient({ chainId: target.chain.id })
  const [budgetText, setBudgetText] = useState('100')
  const [confirmMainnet, setConfirmMainnet] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'wallet' | 'confirming'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [hash, setHash] = useState<Hex | null>(null)
  const [deployed, setDeployed] = useState<Deployed | null>(null)

  const isMainnetTarget = target.chain.id === arc.id
  const paymentToken = getUsdc(target.chain.id)?.address as Address | undefined

  let maxBudget: bigint | null = null
  try {
    const v = parseUsdc(budgetText.trim())
    maxBudget = v > 0n ? v : null
  } catch {
    maxBudget = null
  }
  const onTarget = chainId === target.chain.id
  const walletNetwork =
    chainId === undefined
      ? 'Not connected'
      : chainId === arc.id
        ? 'Arc (mainnet)'
        : chainId === arcTestnet.id
          ? 'Arc Testnet'
          : `Chain ${chainId} (unsupported here)`
  const busy = phase !== 'idle'
  const mainnetReady = !isMainnetTarget || confirmMainnet

  const chooseTarget = (t: Target) => {
    if (busy) return
    setTarget(t)
    setConfirmMainnet(false)
    setError(null)
    setHash(null)
    setDeployed(null)
  }

  const deploy = async () => {
    if (!publicClient || maxBudget === null || !paymentToken || !mainnetReady) return
    setError(null)
    setHash(null)
    try {
      if (!onTarget) await switchChainAsync({ chainId: target.chain.id })
      setPhase('wallet')
      const data = encodeDeployData({ abi: jobsAbi, bytecode: jobsBytecode, args: [paymentToken, maxBudget] })
      const fees = await feeOverrides(publicClient)
      const txHash = await sendTransactionAsync({ data, chainId: target.chain.id, ...fees })
      setHash(txHash)
      setPhase('confirming')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('reverted')
      const address = receipt.contractAddress
      const [token, cap] = await Promise.all([
        publicClient.readContract({ address, abi: jobsAbi, functionName: 'paymentToken' }),
        publicClient.readContract({ address, abi: jobsAbi, functionName: 'maxBudget' }),
      ])
      setDeployed({ chainId: target.chain.id, envChain: target.envChain, address, hash: txHash, block: receipt.blockNumber, maxBudget: cap, token })
    } catch (e) {
      setError(friendlyError(e).message)
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="display text-2xl font-bold">Deploy your own</h1>
        <p className="mt-1 max-w-[60ch] text-pretty text-sm text-muted">
          Deploy a fresh PayOnProofJobs contract from your wallet. It has no owner, no fees and no admin keys, so nobody can change it afterwards.
        </p>
      </div>

      <Card className="space-y-4">
        <div>
          <Label>Network to deploy to</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Network">
            {TARGETS.map((t) => (
              <button
                key={t.chain.id}
                type="button"
                role="radio"
                aria-checked={target.chain.id === t.chain.id}
                disabled={busy}
                onClick={() => chooseTarget(t)}
                className={cx(
                  'min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-50',
                  target.chain.id === t.chain.id ? 'border-accent bg-accent text-white' : 'border-line-strong bg-white text-ink hover:bg-surface',
                )}
              >
                {t.envChain === 'mainnet' ? 'Arc mainnet' : 'Arc Testnet'}
              </button>
            ))}
          </div>
        </div>

        {isMainnetTarget && (
          <div className="space-y-3">
            <Notice tone="warn">
              <span className="block font-semibold">Arc mainnet uses real USDC and every transaction is irreversible.</span>
              This contract has had no third-party audit. Arc Studio does not deploy, sign or fund anything on mainnet: you sign from your own wallet. Use small amounts only.
            </Notice>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-warn/40 bg-white p-3 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0 accent-[#122d45]"
                checked={confirmMainnet}
                onChange={(e) => setConfirmMainnet(e.target.checked)}
                disabled={busy}
              />
              <span>I understand this deploys an unaudited contract to Arc mainnet with real funds, that it cannot be undone, and that I am responsible for reviewing the addresses and settings below.</span>
            </label>
          </div>
        )}

        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Deploying to</dt>
            <dd className="font-semibold">{isMainnetTarget ? 'Arc (mainnet, chain 5042)' : 'Arc Testnet (chain 5042002)'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Your wallet is on</dt>
            <dd className={onTarget ? 'font-semibold text-success' : 'font-semibold text-warn'}>{walletNetwork}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Payment token (USDC)</dt>
            <dd className="min-w-0 text-right">
              {paymentToken && <ExtLink href={buildAddressExplorerUrl(target.chain.id, paymentToken)}>{paymentToken}</ExtLink>}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="shrink-0 text-muted">Bytecode hash</dt>
            <dd className="mono min-w-0 break-all text-right text-xs" title="keccak256 of the creation bytecode in src/generated/PayOnProofJobs.json">
              {jobsBytecodeHash}
            </dd>
          </div>
        </dl>

        <div>
          <Label hint="USDC per job">Max budget</Label>
          <input
            className={inputClass + ' tabular-nums'}
            inputMode="decimal"
            value={budgetText}
            onChange={(e) => /^\d*\.?\d{0,6}$/.test(e.target.value) && setBudgetText(e.target.value)}
            aria-label="Max budget in USDC"
            disabled={busy}
          />
          <p className="mt-1 text-xs text-subtle">
            {maxBudget !== null ? `Constructor argument: ${maxBudget.toString()} (${usdc(maxBudget)})` : 'Enter an amount above zero.'}
          </p>
        </div>

        {!isConnected ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <Button full onClick={show}>
                Connect wallet
              </Button>
            )}
          </ConnectKitButton.Custom>
        ) : !onTarget ? (
          <Button full variant="secondary" loading={switching} onClick={() => void switchChainAsync({ chainId: target.chain.id })}>
            Switch wallet to {isMainnetTarget ? 'Arc mainnet' : 'Arc Testnet'}
          </Button>
        ) : (
          <Button full disabled={maxBudget === null || busy || !mainnetReady} loading={busy} onClick={() => void deploy()}>
            <Rocket className="size-4" aria-hidden />
            {phase === 'wallet' ? 'Confirm in wallet…' : phase === 'confirming' ? 'Confirming…' : isMainnetTarget ? 'Deploy to Arc mainnet' : 'Deploy contract'}
          </Button>
        )}
        {isConnected && onTarget && isMainnetTarget && !confirmMainnet && <p className="text-xs text-muted">Tick the confirmation above to enable deployment.</p>}

        {error && <Notice tone="error">{error}</Notice>}
        {hash && !deployed && (
          <p className="text-xs text-muted">
            Transaction sent: <ExtLink href={buildTxExplorerUrl(target.chain.id, hash)}>{`${hash.slice(0, 14)}…${hash.slice(-8)}`}</ExtLink>
          </p>
        )}
      </Card>

      {deployed && (
        <Card className="space-y-4">
          <Notice tone="success">Deployed and confirmed. One confirmation is final on Arc.</Notice>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Contract</dt>
              <dd className="min-w-0 text-right">
                <ExtLink href={buildAddressExplorerUrl(deployed.chainId, deployed.address)}>{deployed.address}</ExtLink>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Transaction</dt>
              <dd className="min-w-0 text-right">
                <ExtLink href={buildTxExplorerUrl(deployed.chainId, deployed.hash)}>{deployed.hash}</ExtLink>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Block</dt>
              <dd className="tabular-nums">{deployed.block.toString()}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Read back</dt>
              <dd className="text-right tabular-nums">
                cap {usdc(deployed.maxBudget)}, token {deployed.token.slice(0, 8)}…
              </dd>
            </div>
          </dl>
          <div className="space-y-2 rounded-xl bg-surface p-3">
            <p className="text-sm font-semibold">Point this app at your contract</p>
            <p className="text-xs text-muted">Set these in .env (or your hosting settings), then restart the dev server or rebuild.</p>
            <EnvLine k="VITE_CHAIN" v={deployed.envChain} />
            <EnvLine k="VITE_JOBS_ADDRESS" v={deployed.address} />
            <EnvLine k="VITE_JOBS_DEPLOY_BLOCK" v={deployed.block.toString()} />
          </div>
        </Card>
      )}
    </div>
  )
}
