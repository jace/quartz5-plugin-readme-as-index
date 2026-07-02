# quartz5-plugin-readme-as-index

A [Quartz v5](https://quartz.jzhao.xyz/) transformer plugin that treats a
folder's **`README.md`** as its **index** page.

Keep folder landing notes named `README.md` (so GitHub, Obsidian, and friends
render them as the folder's front page) and still get a proper folder page in
Quartz at `/<folder>/`.

## The rule

One rule, case-insensitive: a file whose slug's last segment is `readme` gets
its slug rewritten from `<folder>/readme` to `<folder>/index` — **but only if no
other file already owns the slug `<folder>/index`**.

| Folder contents                | Result                                              |
| ------------------------------ | --------------------------------------------------- |
| only `README.md`               | becomes the folder page at `/<folder>/`             |
| both `index.md` and `README.md`| `index` wins; `README` stays at `/<folder>/readme`  |
| site root `Index.md` + `README.md` | `index` already exists → root `README` left at `/readme` |

## Install

```bash
npx quartz plugin add github:jace/quartz5-plugin-readme-as-index
```

or add it to `quartz.config.yaml` directly. Run it **first** (low `order`) so the
remapped slug is authoritative before other plugins observe it:

```yaml
plugins:
  - source: github:jace/quartz5-plugin-readme-as-index
    enabled: true
    order: 1
```

### Options

| Option       | Default    | Description                                      |
| ------------ | ---------- | ------------------------------------------------ |
| `readmeSlug` | `"readme"` | The slug segment to treat as a folder README.    |

## How it works

Quartz decides a folder's index from a file whose slug ends in `/index` (see
`quartz/util/fileTrie.ts`). Slugs come from `slugifyFilePath()` and are assigned
in two places:

1. `build.ts` populates `ctx.allSlugs` from the **full file list**, before any
   parsing — this drives the file trie, link resolution (`crawl-links`),
   `folder-page`, and `content-index`.
2. `parse.ts` sets `file.data.slug` per file, just before the markdown
   transformers run.

The "no sibling index" check needs folder-level knowledge, so it must see the
whole list. `markdownPlugins(ctx)` is invoked once per build with `ctx.allSlugs`
already fully populated — that is the full-file-list stage. The plugin computes
the remap there, mutates `ctx.allSlugs` in place (the same array reference every
downstream consumer uses in the main process), and the returned per-file
transformer rewrites `file.data.slug` for the emit path.

`folder-page` then matches the remapped `/index` slug and renders the README as
the folder page; because a real `/index` now exists, it does **not** also emit a
colliding virtual folder page.

### Concurrency note

For large vaults Quartz parses markdown in worker threads using a serialized
**copy** of `ctx.allSlugs`; mutations to that copy would not reach the main
process. In practice Quartz only spins up workers above ~128 markdown files
(`quartz/processors/parse.ts`); below that it runs in-process, where the in-place
mutation is authoritative.

## Packaging

`dist/` is committed on purpose. Quartz installs git/local plugin sources by
cloning (or symlinking) and imports `dist/index.js` at runtime — there is no
build step for those sources, so the prebuilt output must be tracked. The plugin
has no runtime dependencies (it imports only TYPES from
`@quartz-community/types`, which are erased), so `dist/index.js` is hand-written
plain ESM. The documented source lives in `src/index.ts`; keep the two in sync.

## License

MIT © Kiran Jonnalagadda
