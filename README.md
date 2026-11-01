- Live app: [https://payonproof-arc.vercel.app](https://payonproof-arc.vercel.app)
- Verified mainnet contract: [0xc861063ec9b10cc14cb623ac9efb67e514ec0d7c](https://explorer.arc.io/address/0xc861063ec9b10cc14cb623ac9efb67e514ec0d7c?tab=contract)
- Demo video (1:52): [https://payonproof-arc.vercel.app/payonproof-demo.mp4](https://payonproof-arc.vercel.app/payonproof-demo.mp4) (also in [`public/payonproof-demo.mp4`](public/payonproof-demo.mp4))
- Example transaction (Job #2 `complete`, 0.5 USDC paid to the provider): [0x751fd7c32f50f56cd95d85ff0074ff323105fe5dafc87e0145785c56b06599af](https://explorer.arc.io/tx/0x751fd7c32f50f56cd95d85ff0074ff323105fe5dafc87e0145785c56b06599af)

# PayOnProof

Pay for work only when proof of delivery arrives.

PayOnProof is a USDC job escrow on Arc. A client locks USDC for a job. A provider (a freelancer, a service or an AI agent) delivers by submitting a keccak256 hash of the deliverable. An evaluator then either releases the payment to the provider or refunds the client. If nobody settles a funded job before it expires, anyone can refund the client, so funds can never get stuck.

It is a minimal, hook-free, fee-free implementation of ERC-8183 (Agentic Commerce): no owner, no admin roles, no fees, no upgradeability and no pause. The repository holds the Solidity contract (`PayOnProofJobs`), its Foundry tests, and a web app (Vite + React + TypeScript) that reads everything from the chain and writes through your browser wallet. There is no backend and no database.

**Unaudited. Use small amounts.** The contract has had no third-party audit.

Built with [Arc Studio](https://studio.arc.io)

## Built with Arc Studio

This project was designed, written, tested and deployed in Arc Studio, Circle's builder for money-powered onchain apps.

- Studio project: https://studio.arc.io/app/9ba1a690-0235-4378-9b26-a8f579ecf023
- **Smart Contract mode with the security pipeline.** The contract was written from a written spec, then went through an automated security review before anything was deployed: a rule-based review and a functional, adversarial review (does it deliver the behaviour asked for, and can a hostile party extract or lock funds), plus Slither static analysis.
- **86 Foundry tests, all passing**, including fuzz tests and 5 invariant tests that run 25,000 random calls each. The invariants check that the contract's USDC balance always equals `totalEscrowed()`, that funds are conserved, that no job pays out or refunds more than once, and that terminal states are never left.
- **Slither:** no actionable findings. The one High (arbitrary `from` in `transferFrom`) was a false positive and was removed by pulling from `msg.sender`; the rest are intended timestamp comparisons for expiry.
- **Security review result:** the rule-based review reported no material findings. The functional review reported one High, accepted by the project owner and documented below: payouts are pushed, so a USDC-blocklisted recipient cannot receive funds (see deviation 7).
- **Testnet integration run** against the live deployment with two distinct funded wallets (client and evaluator, provider). Both flows passed. Transaction hashes are in the next section, and the full record is in `contracts/test-integration/last-run.json`.
- This is best-effort tooling and not a substitute for an independent audit.

### Integration run on Arc Testnet

Flow A, job #2, 1 USDC: submit a delivery hash, complete, and the provider received exactly 1.000000 USDC.

| Step | Transaction |
| --- | --- |
| createJob | `0x6c730226426407ad75ed0e8adc8ee22f7daed53a94d8c8677f46aa31fb196dc1` |
| setBudget | `0x00f0e6ada87dcbda2e4742fecef2b5a56c776114fdaebb0cdfe2e7284a5d0046` |
| approve (exact budget) | `0x5dcbc5cb81d3c2faf14cba307a668833fc6e14f2f7bc60dba51a963dd762dd26` |
| fund | `0xe66e2152f08d91fbf447e1e38319b266db8217229323d299c331781aff1d4a00` |
| submit (provider) | `0x4f7851ca9d34f9e083b9d797b9f1b817707e3f64ebad201b0ab5c0887d541454` |
| complete (evaluator) | `0x0bb8491d044b80be2fc48b070ddd157a12d8651b49d937b9399e0cbd00cb8996` |

Flow B, job #1, 0.5 USDC with the minimum expiry: `claimRefund` reverted before expiry, then the provider wallet called it after expiry and the client got exactly 0.500000 USDC back.

| Step | Transaction |
| --- | --- |
| createJob | `0x41230e4502c9eaace6320faa6b1e05f27339f7318b61ebd3912603e3bbe8c0c0` |
| setBudget | `0xfa92383826dd14c9b6dda8602a5275d005bd76d8cd7e599df887275e6d924329` |
| approve (exact budget) | `0xcb13b6cfcb16aa1d04bd359872374a30291211c6454d54fa9852b24009d8abc6` |
| fund | `0xe4438540019ac427a462fcbee48fd6e2c91c457e6f91388a0340dbe1ff09057b` |
| claimRefund (sent by provider) | `0xbb08b51132fe1281f80f391bd53f702af47b8af86fe5c0c02168339c1771656c` |

Jobs #3 and #4 on the same contract are demo jobs used for interface checks.

## Arc Testnet deployment

| | |
| --- | --- |
| Network | Arc Testnet (chain 5042002) |
| Contract | [`0x08617a0786fa9c5c380f8cc8e6366ac91d16d851`](https://explorer.testnet.arc.io/address/0x08617a0786fa9c5c380f8cc8e6366ac91d16d851) |
| Deployment transaction | [`0xff43c1b3877ade2fa68e757415ff6146db98c173828223992d359c871924bb4c`](https://explorer.testnet.arc.io/tx/0xff43c1b3877ade2fa68e757415ff6146db98c173828223992d359c871924bb4c) |
| Deployment block | 69776195 |
| Payment token | `0x3600000000000000000000000000000000000000` (Arc USDC ERC-20 interface, 6 decimals) |
| `maxBudget` | `100000000` (100 USDC per job) |

## Run the app

Prerequisite: [Bun](https://bun.sh). Foundry is not needed to run or build the web app.

```bash
bun install
cp .env.example .env     # already points at the Arc Testnet deployment above
bun run dev              # http://localhost:5173
```

Other commands:

```bash
bun run build            # production build into dist/ (no Foundry needed)
bun run check            # lint + typecheck
```

What the app does:

- **Home:** the pitch, how it works, open a job by ID, and the latest 20 jobs.
- **Create job:** provider, evaluator, budget, expiry and description. Four transactions (create, set budget, approve the exact budget, fund) with a step tracker that resumes from the onchain state after a reload.
- **Job page:** status, parties, budget, expiry countdown, delivery hash, an explorer-linked timeline, and only the actions your wallet can take (submit delivery, complete, reject, cancel, refund). Anyone can verify a delivery by hashing text or a file locally; files never leave the browser.
- **My jobs:** jobs where your wallet is client, provider or evaluator.
- **Deploy your own** (`/deploy`, linked from the footer): deploy a fresh contract from your own wallet.

Every transaction is sent with a `maxFeePerGas` of at least 20 gwei, because Arc's mempool drops lower fees. Use a wallet with test USDC on Arc Testnet (USDC is also the gas token).

### Environment variables

Public values only. `.env` is not committed; set the same variables in your hosting settings.

| Variable | Purpose |
| --- | --- |
| `VITE_CHAIN` | `testnet` (Arc Testnet, default) or `mainnet` (Arc, chain 5042) |
| `VITE_JOBS_ADDRESS` | PayOnProofJobs address on that network |
| `VITE_JOBS_DEPLOY_BLOCK` | Block the contract was deployed in. Event scanning starts here |

### Hosting on Vercel

`vercel.json` sets the build command (`bun run build`), the output directory (`dist`) and a single-page-app rewrite. The build does not need Foundry because the contract ABI and creation bytecode are committed in `src/generated/` (see below).

## Deploy to mainnet through /deploy

You deploy from your own wallet and sign every transaction yourself. Arc Studio does not deploy to, sign for or fund anything on mainnet.

1. Review the contract and get an independent audit. Mainnet moves real USDC and every transaction is irreversible.
2. Open `/deploy`, connect your wallet and choose **Arc mainnet**. Read the warning and tick the confirmation box; the deploy button stays disabled until you do.
3. Keep `maxBudget` small (the default is 100 USDC). The payment token is the Arc USDC address `0x3600000000000000000000000000000000000000`.
4. Confirm the transaction in your wallet (the fee is at least 20 gwei). The page then shows the contract address, transaction, block number and the exact values to set.
5. Point the app at it and rebuild:

```bash
VITE_CHAIN=mainnet
VITE_JOBS_ADDRESS=0x...            # the new contract
VITE_JOBS_DEPLOY_BLOCK=12345678    # the block it was deployed in
```

To deploy with Foundry instead, see `contracts/script/Deploy.s.sol` below.

## Live on Arc mainnet

PayOnProofJobs is live on Arc mainnet (chain 5042). The project owner deployed it from their own wallet through the `/deploy` page, and two real jobs ran between two separate wallets. The contract has had **no third-party audit**: use small amounts only.

| | |
| --- | --- |
| Network | Arc (chain 5042) |
| Live app | [https://payonproof-arc.vercel.app](https://payonproof-arc.vercel.app) (Vercel, built from this repository with `VITE_CHAIN=mainnet`) |
| Contract | [`0xc861063ec9b10cc14cb623ac9efb67e514ec0d7c`](https://explorer.arc.io/address/0xc861063ec9b10cc14cb623ac9efb67e514ec0d7c) |
| Source verification | Verified, exact match, on [explorer.arc.io](https://explorer.arc.io/address/0xc861063ec9b10cc14cb623ac9efb67e514ec0d7c?tab=contract) |
| Deployment transaction | [`0x71af7d6ce5bead104a6163f78c32ca4e3b6a249edebc1eb26f7c936cab73a243`](https://explorer.arc.io/tx/0x71af7d6ce5bead104a6163f78c32ca4e3b6a249edebc1eb26f7c936cab73a243) |
| Deployment block | 28825889 |
| Payment token | [`0x3600000000000000000000000000000000000000`](https://explorer.arc.io/address/0x3600000000000000000000000000000000000000) (Arc USDC ERC-20 interface, 6 decimals) |
| `maxBudget` | `100000000` (100 USDC per job) |
| Deployer | The project owner's own wallet, through `/deploy` |
| Independent audit | None yet |

The deployed bytecode is the committed `src/generated/PayOnProofJobs.json` export (creation bytecode keccak256 `0x30a214c9e14ad02801042e4d928ce7d18279fe5609e4261610f8816e55859298`).

### Wallets used for the live jobs

| Role | Address |
| --- | --- |
| Client and evaluator | [`0x57b197d9ad7f87047b28f633ee02ad39d302eda6`](https://explorer.arc.io/address/0x57b197d9ad7f87047b28f633ee02ad39d302eda6) |
| Provider | [`0x91a5a5397d9bdce14b19a8bfdbfdf80f4d0dfd16`](https://explorer.arc.io/address/0x91a5a5397d9bdce14b19a8bfdbfdf80f4d0dfd16) |

### Job #2: delivered and paid, 0.5 USDC

The provider submitted the delivery hash `0xab56cb4da02c962a07b5e8d651949a9a8f812597093ac61f1e51dfeba007b3db` and the evaluator completed the job.

| Step | Transaction |
| --- | --- |
| createJob | [`0x860b45351a403fc641dfeddbb4e9eced8621b19cb5af2a5464b8800c6685d451`](https://explorer.arc.io/tx/0x860b45351a403fc641dfeddbb4e9eced8621b19cb5af2a5464b8800c6685d451) |
| setBudget | [`0x90255b66f59774d3af450855a576cd8553080a26cb1541fad46de5f545833d38`](https://explorer.arc.io/tx/0x90255b66f59774d3af450855a576cd8553080a26cb1541fad46de5f545833d38) |
| fund (0.5 USDC, client to contract) | [`0xdaf383122217f3acab0eee8df8fc8952e6bff9adb3edaf8b6ff3074ebbd6935b`](https://explorer.arc.io/tx/0xdaf383122217f3acab0eee8df8fc8952e6bff9adb3edaf8b6ff3074ebbd6935b) |
| submit (by the provider) | [`0x32ffdfbd338053aceae35ad6cfc7de747d9b62c36ba0cbe2a7fbe3e0738987a7`](https://explorer.arc.io/tx/0x32ffdfbd338053aceae35ad6cfc7de747d9b62c36ba0cbe2a7fbe3e0738987a7) |
| complete (by the evaluator, 0.5 USDC contract to provider) | [`0x751fd7c32f50f56cd95d85ff0074ff323105fe5dafc87e0145785c56b06599af`](https://explorer.arc.io/tx/0x751fd7c32f50f56cd95d85ff0074ff323105fe5dafc87e0145785c56b06599af) |

### Job #1: expired and refunded, 0.25 USDC

Nobody settled the job before it expired, so the provider wallet called `claimRefund` and the escrow went back to the client.

| Step | Transaction |
| --- | --- |
| createJob | [`0x9268f4d9bacf9b7cb9890c8bb5e729020f34be21904070148c1e6d72d329c131`](https://explorer.arc.io/tx/0x9268f4d9bacf9b7cb9890c8bb5e729020f34be21904070148c1e6d72d329c131) |
| setBudget | [`0xfeb33d4b88b61362bf672f9e08bc3adb83d92f9ccb17f5956e22be156c12d487`](https://explorer.arc.io/tx/0xfeb33d4b88b61362bf672f9e08bc3adb83d92f9ccb17f5956e22be156c12d487) |
| fund (0.25 USDC, client to contract) | [`0x7641f85e77b79bbd74d2adab9823d58792f0878afc9373a41d731a1f6e553027`](https://explorer.arc.io/tx/0x7641f85e77b79bbd74d2adab9823d58792f0878afc9373a41d731a1f6e553027) |
| claimRefund (called by the provider wallet after expiry, 0.25 USDC contract to client) | [`0x76624e121cda11e576775d76fb9b2c3392da3f78e5869420cbd93f21b5d90d2b`](https://explorer.arc.io/tx/0x76624e121cda11e576775d76fb9b2c3392da3f78e5869420cbd93f21b5d90d2b) |

After both jobs `totalEscrowed()` is 0, so nothing is left in escrow.

## Contract reference

`contracts/PayOnProofJobs.sol`, Solidity ^0.8.24 (compiled with 0.8.28, Cancun), OpenZeppelin `SafeERC20` and `ReentrancyGuard`. The contract never touches native balance (`msg.value` is not used): on Arc the native balance has 18 decimals while the USDC ERC-20 interface has 6, and this contract only uses the 6-decimal ERC-20 interface.

Constructor: `constructor(address paymentToken, uint256 maxBudget)`. Both values are immutable and must be non-zero.

### State machine

```
                      reject (client)
            +-----------------------------------> Rejected
            |
 createJob  |   fund (client)      submit (provider)     complete (evaluator)
 --------> Open ------------> Funded ------------> Submitted ------------> Completed
                                |                     |
                                | reject (evaluator)  | reject (evaluator)
                                +----> Rejected <-----+
                                |                     |
                                | claimRefund (anyone, now >= expiredAt)
                                +----> Expired <------+
```

- `Open`: terms are being set. `setProvider` (client, once) and `setBudget` (client or provider).
- `Funded`: budget is escrowed. The provider may `submit` until `expiredAt`.
- `Submitted`: a deliverable hash is stored. The evaluator decides.
- `Completed`, `Rejected`, `Expired`: terminal. Funds have moved exactly once.

`complete` and evaluator `reject` stay available after `expiredAt` until someone calls `claimRefund`. The first valid settlement wins.

### Roles

| Role | Who | Allowed actions |
| --- | --- | --- |
| Client | Caller of `createJob` | `setProvider` (Open, once), `setBudget` (Open), `fund` (Open), `reject` (Open only, no funds move) |
| Provider | Set at `createJob` or by `setProvider`. Must differ from client and evaluator | `setBudget` (Open), `submit` (Funded, before expiry) |
| Evaluator | Set at `createJob`. Non-zero | `complete` (Submitted), `reject` (Funded or Submitted, refunds the client) |
| Anyone | Any address | `claimRefund` (Funded or Submitted, at or after expiry), all view functions |

The evaluator may equal the client. Authorization for `reject` depends on both the caller and the job status. Once work is submitted the evaluator is trusted, as in ERC-8183: the contract stores only a hash and cannot judge the work.

### Validation summary

- `createJob`: evaluator non-zero; provider zero or distinct from client and evaluator; `expiredAt >= now + 5 minutes`; `hook == address(0)`; description at most 280 bytes.
- `setBudget`: `0 < amount <= maxBudget`.
- `fund`: provider set, budget non-zero, `budget == expectedBudget`, `now < expiredAt`.
- `submit`: `now < expiredAt`, deliverable non-zero.

### Deviations from the ERC-8183 reference

1. `fund(jobId, expectedBudget, optParams)` takes `expectedBudget` as a front-running guard (per the ERC-8183 prose), so a provider cannot raise the budget between the client's decision and the funding transaction.
2. Hooks are unsupported. `createJob` reverts unless `hook == address(0)`, and the `hook` field is kept only for ABI compatibility.
3. No fees. The provider receives the full budget, the client receives the full refund.
4. `maxBudget` cap. A single job's budget cannot exceed the immutable `maxBudget`.
5. The provider must differ from both the client and the evaluator, so a provider can never approve its own work.
6. `optParams` arguments are accepted for signature compatibility and ignored.
7. Funds are pushed directly to the provider or client on settlement (no pull-payment). If the token itself blocks the recipient (for example a USDC blocklist), that transfer reverts. A provider that cannot receive USDC cannot be paid, but the evaluator can still reject (refund the client) and anyone can `claimRefund` after expiry. A client that cannot receive USDC cannot be refunded. This was the functional review's High finding and was accepted by the project owner.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh) (Foundry only for the contract). `forge-std` is vendored in `lib/forge-std`; OpenZeppelin comes from `node_modules` after `bun install`.

```bash
bun install
bun run contracts:build        # forge build
bun run contracts:test         # forge test: 86 unit, fuzz and invariant tests with a 6-decimal mock USDC
bun run export-artifact        # regenerate src/generated from the forge build
```

Tests live in `contracts/test/`. The invariant suite is `PayOnProofJobs.Invariant.t.sol` and takes about 25 seconds.

### Contract artifact for the web app

The web app never reads `contracts/out`. The ABI and creation bytecode live in committed files under `src/generated/` (`PayOnProofJobs.json` is the canonical export, `PayOnProofJobs.ts` exposes the ABI as a typed constant). They are used by every contract call and by the `/deploy` page. After changing `contracts/PayOnProofJobs.sol`, regenerate and commit them:

```bash
forge build && bun run export-artifact
```

The JSON records the compiler version and the keccak256 of the creation bytecode (`0x30a214c9e14ad02801042e4d928ce7d18279fe5609e4261610f8816e55859298` for the current source), so you can compare it with your own `forge build`. The `/deploy` page shows the same hash.

### Deploy with Foundry

`contracts/script/Deploy.s.sol` reads `PAYMENT_TOKEN` and `MAX_BUDGET` from the environment.

```bash
export PAYMENT_TOKEN=0x3600000000000000000000000000000000000000
export MAX_BUDGET=100000000
forge script contracts/script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

`RPC_URL` and `PRIVATE_KEY` are supplied by you on the command line and are never stored in the repository.

### Live integration test

`contracts/test-integration/payonproof.live.ts` runs both flows above against a deployed contract on Arc Testnet using two throwaway wallets. Create them and fund them with test USDC first:

```bash
bun run contracts/test-integration/gen-wallets.ts   # writes keys to /tmp/pop-wallets.json, outside the repo
bun run contracts/test-integration/payonproof.live.ts
```

The keys never enter the repository. `seed-demo.ts` creates two demo jobs for interface checks.
