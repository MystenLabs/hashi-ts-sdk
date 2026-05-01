# Releasing `@mysten-incubation/hashi`

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning and npm publishing. The `@changesets/cli` is installed as a dev dependency at the workspace root and available via `pnpm changeset`.

## How it works

Every PR that changes the public `@mysten-incubation/hashi` package should include a **changeset** — a small markdown file that describes the change and its semver impact (patch / minor / major).

When changesets are merged to `main`, a GitHub Action automatically opens a **"Version Packages"** PR that bumps the version and updates the changelog. Merging that PR triggers an automated npm publish via OIDC trusted publisher.

## Day-to-day workflow

### 1. Create a changeset with your PR

From the repo root:

```bash
pnpm changeset
```

The interactive CLI will:

1. Ask which package(s) are affected (just `@mysten-incubation/hashi`).
2. Ask the semver bump type (patch / minor / major).
3. Ask for a summary of the change.

It writes a file in `.changeset/` (e.g. `.changeset/funny-dogs-dance.md`). Commit that file with your PR.

Useful checks:

```bash
pnpm changeset status
pnpm changeset status --verbose
```

If your PR doesn't affect the published package (CI changes, docs-only, hashi submodule bumps), you can ignore the bot warning — no changeset needed.

### 2. Merge your PR

After review, merge to `main` as usual.

### 3. Release via the "Version Packages" PR

After merge, the `changesets.yml` workflow creates or updates a PR titled **"Version Packages"** (branch `changeset-release/main`). It:

- Bumps the version in `packages/hashi/package.json`.
- Prepends the new section to `packages/hashi/CHANGELOG.md`.
- Deletes consumed `.changeset/*.md` files.

**Merge it when you're ready to release.** That triggers the npm publish. You control release timing — accumulate multiple changesets before merging if you want to batch.

## First-time setup (one-time, per package)

The first publish must be done manually because the OIDC trusted-publisher rule on npm requires the package to already exist on the registry:

```bash
pnpm install
pnpm build
cd packages/hashi
npm login    # must have publish rights on the @mysten-incubation scope
npm publish --access public
```

Then on [npmjs.com](https://www.npmjs.com/package/@mysten-incubation/hashi):

- Package settings → Publishing access → Add trusted publisher
- Repository: `MystenLabs/hashi-ts-sdk`
- Workflow: `changesets.yml`
- Environment: _(leave blank)_

After this, every subsequent release goes through the automated flow above.

## Semver guidelines

| Bump    | When to use                                             |
| ------- | ------------------------------------------------------- |
| `patch` | Bug fixes, internal refactors with no public API change |
| `minor` | New features, non-breaking additions to the public API  |
| `major` | Breaking changes to the public API                      |

While the package is on `0.x`, every minor bump is allowed to be breaking by semver convention. Once `1.0.0` ships, breaking changes require a major bump.

## Changeset file format

A changeset file looks like:

```markdown
---
"@mysten-incubation/hashi": patch
---

Fix txid byte ordering before recording on-chain (SEDEFI-190).
```

The frontmatter declares the package and bump type; the body becomes a CHANGELOG entry.
