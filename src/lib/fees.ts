import { parseGwei, type PublicClient } from 'viem'

/** Arc's mempool silently drops transactions whose maxFeePerGas is below this floor. */
export const MIN_MAX_FEE_PER_GAS = parseGwei('20')

export interface FeeOverrides {
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

/** Fee fields for every write: never below 20 gwei maxFeePerGas. */
export async function feeOverrides(client: PublicClient): Promise<FeeOverrides> {
  try {
    const est = await client.estimateFeesPerGas()
    const maxFeePerGas = est.maxFeePerGas > MIN_MAX_FEE_PER_GAS ? est.maxFeePerGas : MIN_MAX_FEE_PER_GAS
    const prio = est.maxPriorityFeePerGas
    return { maxFeePerGas, maxPriorityFeePerGas: prio > maxFeePerGas ? maxFeePerGas : prio }
  } catch {
    return { maxFeePerGas: MIN_MAX_FEE_PER_GAS, maxPriorityFeePerGas: parseGwei('1') }
  }
}
