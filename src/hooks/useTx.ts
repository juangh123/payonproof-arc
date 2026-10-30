import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import type { Hash, TransactionReceipt } from 'viem'
import { appChain } from '@/lib/env'
import { feeOverrides } from '@/lib/fees'
import { AppError, friendlyError } from '@/lib/errors'

type WriteArgs = Parameters<ReturnType<typeof useWriteContract>['writeContractAsync']>[0]
export type TxCall = Omit<WriteArgs, 'chainId' | 'maxFeePerGas' | 'maxPriorityFeePerGas' | 'account'>

export type TxPhase = 'idle' | 'wallet' | 'confirming'

/**
 * Sends one contract write from the connected wallet on the app's network:
 * switches / adds the network if needed, forces maxFeePerGas >= 20 gwei, waits for the receipt.
 * On Arc one confirmation is final, so a successful receipt is the finished state.
 */
export function useTx() {
  const { chainId, isConnected } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: appChain.id })
  const [phase, setPhase] = useState<TxPhase>('idle')
  const [hash, setHash] = useState<Hash | undefined>()
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(
    async (call: TxCall): Promise<{ hash: Hash; receipt: TransactionReceipt } | null> => {
      setError(null)
      setHash(undefined)
      try {
        if (!isConnected) throw new AppError('Connect your wallet to continue.', 'network')
        if (!publicClient) throw new AppError('No connection to the network. Retry in a moment.', 'network')
        if (chainId !== appChain.id) {
          try {
            await switchChainAsync({ chainId: appChain.id })
          } catch (e) {
            const f = friendlyError(e)
            throw new AppError(f.cancelled ? f.message : `Switch your wallet to ${appChain.name} to continue.`, f.cancelled ? 'rejected' : 'network')
          }
        }
        setPhase('wallet')
        const fees = await feeOverrides(publicClient)
        const txHash = await writeContractAsync({ ...call, chainId: appChain.id, ...fees } as WriteArgs)
        setHash(txHash)
        setPhase('confirming')
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status !== 'success') throw new AppError('The transaction was reverted onchain.', 'revert')
        return { hash: txHash, receipt }
      } catch (e) {
        // Failures (including a cancelled signature) are reported through `error`; callers get null.
        setError(friendlyError(e).message)
        return null
      } finally {
        setPhase('idle')
      }
    },
    [chainId, isConnected, publicClient, switchChainAsync, writeContractAsync],
  )

  return { send, phase, hash, error, clearError: () => setError(null), busy: phase !== 'idle' }
}
