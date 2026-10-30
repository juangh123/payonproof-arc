/**
 * Creates two throwaway test wallets (client/evaluator and provider) for the live integration test.
 * Keys are written to /tmp/pop-wallets.json (outside the repository, mode 600) and never printed.
 * Fund the printed addresses with test USDC on Arc Testnet before running payonproof.live.ts.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const file = '/tmp/pop-wallets.json'
if (!existsSync(file)) {
  writeFileSync(file, JSON.stringify({ client: generatePrivateKey(), provider: generatePrivateKey() }), { mode: 0o600 })
}
const keys = JSON.parse(await Bun.file(file).text()) as { client: `0x${string}`; provider: `0x${string}` }
console.log('client / evaluator:', privateKeyToAccount(keys.client).address)
console.log('provider          :', privateKeyToAccount(keys.provider).address)
