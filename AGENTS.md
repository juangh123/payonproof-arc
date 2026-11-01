# PayOnProof

USDC job escrow on Arc (minimal ERC-8183): client escrows, provider submits a delivery hash, evaluator completes or rejects, anyone can refund after expiry.

Built with Arc Studio - https://studio.arc.io

## Stack

- Contract: `contracts/PayOnProofJobs.sol` (Solidity ^0.8.24, Foundry, OpenZeppelin). Tests in `contracts/test/`.
- Web app: Vite + React + TypeScript + Tailwind, wagmi v2 + viem, ConnectKit (injected wallets). No backend.
- ABI and creation bytecode are committed in `src/generated/` (regenerate with `forge build && bun run export-artifact`). The web build never reads `contracts/out`.

## Deployments

- Arc Testnet: `0x08617a0786fa9c5c380f8cc8e6366ac91d16d851`, block 69776195, tx `0xff43c1b3877ade2fa68e757415ff6146db98c173828223992d359c871924bb4c`. paymentToken `0x3600000000000000000000000000000000000000`, maxBudget `100000000`.
- Arc mainnet: `0xc861063ec9b10cc14cb623ac9efb67e514ec0d7c`, block 28825889, tx `0x71af7d6ce5bead104a6163f78c32ca4e3b6a249edebc1eb26f7c936cab73a243`. paymentToken `0x3600000000000000000000000000000000000000`, maxBudget `100000000`. Live app https://payonproof-arc.vercel.app. Source verified on explorer.arc.io.

## Rules

- Config comes from `VITE_CHAIN`, `VITE_JOBS_ADDRESS`, `VITE_JOBS_DEPLOY_BLOCK`. Never hardcode addresses in source.
- Every write uses `maxFeePerGas` >= 20 gwei (Arc drops lower).
- Amounts are the 6-decimal USDC ERC-20 view. Never mix with the 18-decimal native view.
- Known accepted limitation: payouts are pushed, so a USDC-blocklisted recipient cannot receive funds.
