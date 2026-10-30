/** Seeds two demo jobs on Arc Testnet for UI checks: #3 Funded (0.25 USDC), #4 Open. Keys come from /tmp/pop-wallets.json. */
import { createPublicClient, createWalletClient, erc20Abi, http, parseEventLogs, zeroAddress, parseGwei, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { jobsAbi } from '../../src/lib/abi'

const JOBS = process.env.VITE_JOBS_ADDRESS as Address
const USDC: Address = '0x3600000000000000000000000000000000000000'
const keys = JSON.parse(await Bun.file('/tmp/pop-wallets.json').text()) as { client: Hex; provider: Hex }
const transport = http('https://rpc.testnet.arc.io')
const pub = createPublicClient({ chain: arcTestnet, transport })
const clientAcc = privateKeyToAccount(keys.client)
const providerAcc = privateKeyToAccount(keys.provider)
const client = createWalletClient({ account: clientAcc, chain: arcTestnet, transport })
const fee = { maxFeePerGas: parseGwei('30'), maxPriorityFeePerGas: parseGwei('5') }
const wait = (h: Hex) => pub.waitForTransactionReceipt({ hash: h })
const now = (await pub.getBlock()).timestamp

const make = async (desc: string, ttl: bigint) => {
  const r = await wait(await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'createJob', args: [providerAcc.address, clientAcc.address, now + ttl, desc, zeroAddress], ...fee }))
  return parseEventLogs({ abi: jobsAbi, logs: r.logs, eventName: 'JobCreated' })[0].args.jobId
}
const id3 = await make('Design a logo for the PayOnProof demo', 86400n)
await wait(await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'setBudget', args: [id3, 250_000n, '0x'], ...fee }))
await wait(await client.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [JOBS, 250_000n], ...fee }))
await wait(await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'fund', args: [id3, 250_000n, '0x'], ...fee }))
const id4 = await make('Draft job that is not funded yet', 86400n)
console.log('seeded', id3, id4)
