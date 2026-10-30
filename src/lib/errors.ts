import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const CONTRACT_ERRORS: Record<string, string> = {
  Unauthorized: 'This wallet is not allowed to do that on this job.',
  InvalidStatus: 'The job is not in the right state for this action. Refresh and try again.',
  InvalidEvaluator: 'The evaluator address is not valid.',
  InvalidProvider: 'The provider must be a valid address different from the client and the evaluator.',
  ProviderAlreadySet: 'A provider is already set for this job.',
  ProviderNotSet: 'Set a provider before funding.',
  InvalidExpiry: 'The expiry must be at least 5 minutes in the future.',
  HooksUnsupported: 'Hooks are not supported.',
  DescriptionTooLong: 'The description is longer than 280 bytes.',
  InvalidBudget: 'The budget must be above zero and within the per-job cap.',
  BudgetMismatch: 'The budget changed since you reviewed it. Reload the job and check the amount.',
  JobPastExpiry: 'The job has expired.',
  JobNotExpired: 'The job has not expired yet.',
  InvalidDeliverable: 'The delivery hash cannot be empty.',
  JobNotFound: 'That job does not exist.',
}

export class AppError extends Error {
  constructor(message: string, public kind: 'rejected' | 'balance' | 'allowance' | 'network' | 'revert' | 'other' = 'other') {
    super(message)
  }
}

/** Turns any wallet / RPC / contract error into a short sentence for the user. */
export function friendlyError(err: unknown): { message: string; cancelled: boolean } {
  if (err instanceof AppError) return { message: err.message, cancelled: err.kind === 'rejected' }
  const text = String((err as { message?: string } | undefined)?.message ?? '').toLowerCase()
  const code = (err as { code?: number } | undefined)?.code

  if (err instanceof BaseError) {
    const rejected = err.walk((e) => e instanceof UserRejectedRequestError)
    if (rejected) return { message: 'You rejected the signature in your wallet. Nothing was sent.', cancelled: true }
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && CONTRACT_ERRORS[name]) return { message: CONTRACT_ERRORS[name], cancelled: false }
      const reason = reverted.reason ?? ''
      if (/allowance/i.test(reason)) return { message: 'USDC allowance is too low. Approve the exact budget first.', cancelled: false }
      if (/balance/i.test(reason)) return { message: 'Insufficient USDC balance for this budget.', cancelled: false }
    }
  }
  if (code === 4001 || text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) {
    return { message: 'You rejected the signature in your wallet. Nothing was sent.', cancelled: true }
  }
  if (text.includes('allowance')) return { message: 'USDC allowance is too low. Approve the exact budget first.', cancelled: false }
  if (text.includes('exceeds balance') || text.includes('insufficient balance') || text.includes('transfer amount')) {
    return { message: 'Insufficient USDC balance for this budget.', cancelled: false }
  }
  if (text.includes('insufficient funds')) {
    return { message: 'Not enough USDC to pay the network fee. Get test USDC and try again.', cancelled: false }
  }
  if (text.includes('chain') && (text.includes('mismatch') || text.includes('does not match') || text.includes('switch'))) {
    return { message: 'Your wallet is on the wrong network. Switch networks and try again.', cancelled: false }
  }
  if (text.includes('network') || text.includes('timeout') || text.includes('fetch')) {
    return { message: 'Network issue. Check your connection and retry.', cancelled: false }
  }
  if (text.includes('revert')) return { message: 'The transaction would fail. Refresh the job and check its state.', cancelled: false }
  return { message: 'Something went wrong. Please try again.', cancelled: false }
}
