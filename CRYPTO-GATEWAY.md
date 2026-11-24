# Self-hosted crypto gateway (BSC + Ethereum)

Accepts **USDT, USDC and BNB on BNB Smart Chain** and **USDT, USDC and ETH on
Ethereum**, with no third-party processor. It is the only crypto payment path:
until it is configured, crypto deposits and withdrawals are unavailable. The code lives in
`user-backend/src/services/onchain.js` (wallets, chains, prices) and
`onchainWorker.js` (the background worker).

## How it works

**Deposits.** Each player gets one permanent address, derived from
`ONCHAIN_MNEMONIC`. The same address works on both chains, so a player who picks
the "wrong" network is still credited. Every `ONCHAIN_POLL_SECONDS`, the worker
reads each watched address's balance at a block that is `<CHAIN>_CONFIRMATIONS`
deep. Anything above what is already accounted for is credited in USD:
stablecoins at 1:1, and BNB/ETH at the Chainlink price. Transfers under
`ONCHAIN_MIN_DEPOSIT_USD` wait until the address holds at least that much.

**Sweeps.** Credited balances worth at least `<CHAIN>_SWEEP_MIN_USD` are moved to
`ONCHAIN_SWEEP_TO`. A deposit address that holds tokens but no gas first gets a
small BNB/ETH top-up from the hot wallet.

**Withdrawals are paid manually.** The player requests one with their wallet
address. The admin sends the coins to that address from their own wallet, then
accepts it under Money › Withdrawals (optionally with the tx hash), or rejects it
with a reason. The player is emailed either way. The gateway sends nothing:
there is no automatic payout.

**Safety.** Every transaction (sweeps, gas top-ups) is signed and saved in
`OnchainTxs` *before* it is broadcast, so a crash or restart can only rebroadcast
the same transaction.

## Setup

1. **Generate the secrets offline**, for example on an air-gapped machine:
   ```sh
   node -e "const {Wallet}=require('ethers');const m=Wallet.createRandom();console.log('MNEMONIC',m.mnemonic.phrase);const h=Wallet.createRandom();console.log('HOT_KEY',h.privateKey,'HOT_ADDRESS',h.address)"
   ```
   Write the mnemonic on paper. If it is lost, every unswept deposit is lost
   with it; if it leaks, every deposit address can be emptied.
2. **Get RPC URLs** from a paid provider (QuickNode, Alchemy, Ankr, NodeReal...).
   Public RPCs rate-limit and often refuse historical balance queries.
3. Fill in the `ONCHAIN_*`, `BSC_*` and `ETH_*` block in `user-backend/.env`
   (see `.env.example`). Leave `ETH_RPC_URL` empty to run on BSC only.
4. **Fund the hot wallet** with a working float of USDT/USDC on each chain, plus
   BNB and ETH for gas.
5. Restart the user backend. The log shows
   `On-chain gateway on BSC, ETH: hot wallet 0x…, sweeping to 0x…`.
   A bad key or address stops startup with a clear message instead.
6. **Test with small amounts first**: deposit $5–10 of USDT on BSC, then
   withdraw it back.

To try it on BSC testnet, set `BSC_CHAIN_ID=97`, a testnet RPC, and testnet
token and price-feed addresses.

## Operating notes

- **Never truncate or delete `OnchainAddresses`.** A row's `uid` is its HD
  index, and reissuing it would hand an old player's address to a new one.
- Only one process may run the worker. If you run several user-backend
  instances, set `ONCHAIN_WORKER=false` on all but one.
- Don't send transactions from the hot wallet by hand while the backend is
  running, because the two would fight over nonces. To move funds out, use a
  different wallet: make the treasury `ONCHAIN_SWEEP_TO` and top the hot wallet
  up from it.
- Logs to watch: `still unmined after 30 minutes` (gas spike or RPC problem), `was dropped` and
  `does not match HD index` (something is wrong: investigate before going on).
- Tests: `npm test` in `user-backend` runs `test/onchain.test.js` against two
  local chains (ganache).
