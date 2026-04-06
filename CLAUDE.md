# Hashi TypeScript SDK

TypeScript SDK for interacting with the Hashi Sui Move smart contracts.

## Structure

- `src/` — SDK source code (TypeScript)
- `hashi/` — git submodule ([MystenLabs/hashi](https://github.com/MystenLabs/hashi)); contains `packages/` with Sui Move contracts. This will be removed when hashi is published on MVR because codegen will no longer have to use the `@local-pkg` util.
- `package.json` — package: `@mysten/hashi`, license: Apache-2.0
- `tsconfig.json` — strict TS config, ES2020 target, NodeNext modules. Cloned from `tsconfig.shared.ts`.

## Commands

- `pnpm test` — run tests (not yet configured)
- `pnpm build-contract` — build the Sui Move contracts (`hashi/packages/hashi/`) in order for them to be consumed by the codegen tool.

## Conventions

- Keep this file short and up to date as the SDK evolves.
