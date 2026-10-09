# Mark58

In-browser Solana vanity address generator.

Live: [mark58.xyz](https://mark58.xyz)

Pick a prefix, grind Ed25519 keypairs until the address matches. Everything stays in the tab — no backend, no accounts, no analytics. Production builds set `connect-src 'none'` so the page cannot talk to a server even if it wanted to.

## Use it

1. Open [mark58.xyz](https://mark58.xyz)
2. Type a prefix (Base58, case-sensitive, max 8 chars)
3. Hit generate and leave the tab open
4. When it hits, copy the address / private key, or download the JSON keypair for Solana CLI

Phantom and Solflare take the Base58 private key. Solana CLI takes the JSON byte array.

## Security

Keys are created locally with Web Crypto (Ed25519), falling back to tweetnacl if the browser does not support it. They live in memory until you copy, download, or clear them.

Nobody can recover a key generated here. If you lose it, the wallet is gone. Store it offline before sending funds.

## Prefixes

Solana addresses are Base58, so `0`, `O`, `I`, and `l` are invalid.

First character matters a lot. Prefixes starting with `2–9` or `A–H` are much faster. Lowercase and `J–Z` at the start are rare and will take longer.

A 1–2 character prefix is usually instant. 4+ can take hours. 6+ can take days. Keep the machine awake.

## Run locally

```sh
npm install
npm run dev
```

```sh
npm run build
npm run preview
```

Node 18+ is enough.

## Stack

React + Vite, web workers for the grind, `bs58` + `tweetnacl`.

Not affiliated with the Solana Foundation.
