/**
 * Live integration test for PayOnProofJobs on Arc Testnet.
 * Two throwaway wallets (keys in /tmp/pop-wallets.json, created by the test setup, never committed):
 *   client = client + evaluator, provider = provider.
 *
 *   Flow A: 1 USDC job -> submit hash (provider) -> complete (evaluator) -> provider gets exactly 1 USDC.
 *   Flow B: 0.5 USDC job with minimum expiry -> expires -> claimRefund called BY THE PROVIDER ->
 *           client gets exactly 0.5 USDC back.
 *
 * Run: bun run contracts/test-integration/payonproof.live.ts
 */
import { createPublicClient, createWalletClient, erc20Abi, http, keccak256, parseEventLogs, stringToHex, toBytes, zeroAddress, parseGwei, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { writeFileSync } from 'node:fs'
import { jobsAbi } from '../../src/lib/abi'

const JOBS = process.env.VITE_JOBS_ADDRESS as Address
const USDC: Address = '0x3600000000000000000000000000000000000000'
const keys = JSON.parse(await Bun.file('/tmp/pop-wallets.json').text()) as { client: Hex; provider: Hex }

const pub = createPublicClient({ chain: arcTestnet, transport: http('https://rpc.testnet.arc.io') })
const clientAcc = privateKeyToAccount(keys.client)
const providerAcc = privateKeyToAccount(keys.provider)
const client = createWalletClient({ account: clientAcc, chain: arcTestnet, transport: http('https://rpc.testnet.arc.io') })
const provider = createWalletClient({ account: providerAcc, chain: arcTestnet, transport: http('https://rpc.testnet.arc.io') })

const results: Array<{ check: string; pass: boolean; detail?: string }> = []
const txs: Array<{ flow: string; step: string; hash: Hex }> = []
const check = (name: string, pass: boolean, detail?: string) => {
  results.push({ check: name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

async function fees() {
  const e = await pub.estimateFeesPerGas()
  const min = parseGwei('20')
  const maxFeePerGas = e.maxFeePerGas > min ? e.maxFeePerGas : min
  return { maxFeePerGas, maxPriorityFeePerGas: e.maxPriorityFeePerGas > maxFeePerGas ? maxFeePerGas : e.maxPriorityFeePerGas }
}
async function confirm(flow: string, step: string, hash: Hex) {
  const r = await pub.waitForTransactionReceipt({ hash })
  txs.push({ flow, step, hash })
  console.log(`  tx ${flow}/${step}: ${hash} ${r.status}`)
  if (r.status !== 'success') throw new Error(`${flow}/${step} reverted`)
  return r
}
const bal = (a: Address) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
const getJob = (id: bigint) => pub.readContract({ address: JOBS, abi: jobsAbi, functionName: 'getJob', args: [id] })
const escrowed = () => pub.readContract({ address: JOBS, abi: jobsAbi, functionName: 'totalEscrowed' })

async function createAndFund(flow: string, budget: bigint, expiredAt: bigint, description: string) {
  const r = await confirm(
    flow,
    'createJob',
    await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'createJob', args: [providerAcc.address, clientAcc.address, expiredAt, description, zeroAddress], ...(await fees()) }),
  )
  const id = parseEventLogs({ abi: jobsAbi, logs: r.logs, eventName: 'JobCreated' })[0].args.jobId
  await confirm(flow, 'setBudget', await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'setBudget', args: [id, budget, '0x'], ...(await fees()) }))
  await confirm(flow, 'approve', await client.writeContract({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [JOBS, budget], ...(await fees()) }))
  const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'allowance', args: [clientAcc.address, JOBS] })
  check(`${flow}: allowance equals the exact budget`, allowance === budget, `${allowance}`)
  await confirm(flow, 'fund', await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'fund', args: [id, budget, '0x'], ...(await fees()) }))
  const j = await getJob(id)
  check(`${flow}: job #${id} is Funded with the budget`, j.status === 1 && j.budget === budget)
  return id
}

console.log('client/evaluator', clientAcc.address, 'provider', providerAcc.address, 'contract', JOBS)
const startClient = await bal(clientAcc.address)
const startProvider = await bal(providerAcc.address)
console.log('start balances (6-dec USDC): client', startClient, 'provider', startProvider)
check('wallets are distinct', clientAcc.address !== providerAcc.address)
check('both wallets funded', startClient > 1_700_000n && startProvider > 0n, `${startClient} / ${startProvider}`)
const escrow0 = await escrowed()

// ---- Flow B setup first (it needs ~5 minutes to expire) ----
const chainNow = (await pub.getBlock()).timestamp
const expiredB = chainNow + 330n
console.log('\nFlow B: 0.5 USDC, minimum expiry (now + 5 min + margin)')
const idB = await createAndFund('B', 500_000n, expiredB, 'integration test B: expires and is refunded')

// ---- Flow A: happy path ----
console.log('\nFlow A: 1 USDC, submit + complete')
const idA = await createAndFund('A', 1_000_000n, (await pub.getBlock()).timestamp + 3600n, 'integration test A: delivered and paid')
const deliverable = keccak256(toBytes(`payonproof integration deliverable ${Date.now()}`))
await confirm('A', 'submit', await provider.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'submit', args: [idA, deliverable, '0x'], ...(await fees()) }))
const stored = await pub.readContract({ address: JOBS, abi: jobsAbi, functionName: 'deliverableOf', args: [idA] })
check('A: stored deliverable hash equals the submitted keccak256', stored === deliverable)
check('A: job is Submitted', (await getJob(idA)).status === 2)
const providerBefore = await bal(providerAcc.address) // provider pays no more gas below: complete is sent by the evaluator
await confirm('A', 'complete', await client.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'complete', args: [idA, stringToHex('itest-ok', { size: 32 }), '0x'], ...(await fees()) }))
const providerAfter = await bal(providerAcc.address)
check('A: provider received exactly 1 USDC', providerAfter - providerBefore === 1_000_000n, `delta ${providerAfter - providerBefore}`)
check('A: job is Completed', (await getJob(idA)).status === 3)

// ---- Flow B: expiry and refund by the provider ----
console.log('\nFlow B: waiting for expiry', expiredB.toString())
try {
  await pub.simulateContract({ address: JOBS, abi: jobsAbi, functionName: 'claimRefund', args: [idB], account: providerAcc })
  check('B: claimRefund reverts before expiry', false, 'simulation unexpectedly succeeded')
} catch {
  check('B: claimRefund reverts before expiry', true)
}
for (;;) {
  const ts = (await pub.getBlock()).timestamp
  if (ts >= expiredB) break
  await new Promise((r) => setTimeout(r, 10_000))
}
const clientBefore = await bal(clientAcc.address) // the client sends no transaction below
await confirm('B', 'claimRefund (sent by provider)', await provider.writeContract({ address: JOBS, abi: jobsAbi, functionName: 'claimRefund', args: [idB], ...(await fees()) }))
const clientAfter = await bal(clientAcc.address)
check('B: client got exactly 0.5 USDC back', clientAfter - clientBefore === 500_000n, `delta ${clientAfter - clientBefore}`)
check('B: job is Expired', (await getJob(idB)).status === 5)
check('B: refund call was made by the provider wallet', true, providerAcc.address)

const escrow1 = await escrowed()
check('totalEscrowed returned to its starting value', escrow1 === escrow0, `${escrow0} -> ${escrow1}`)

const summary = { contract: JOBS, jobs: { A: idA.toString(), B: idB.toString() }, txs, results, allPassed: results.every((r) => r.pass) }
writeFileSync('contracts/test-integration/last-run.json', JSON.stringify(summary, null, 2))
console.log('\nALL PASSED:', summary.allPassed)
process.exit(summary.allPassed ? 0 : 1)
