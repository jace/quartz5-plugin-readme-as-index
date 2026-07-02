import type { QuartzTransformerPlugin, BuildCtx, FullSlug } from "@quartz-community/types"
import type { Root } from "mdast"
import type { VFile } from "vfile"

/**
 * README as Folder Index
 * =======================
 *
 * Many people keep folder landing notes named `README.md` (not `index.md`) so
 * that GitHub, Obsidian, etc. render them as the folder's front page. Quartz,
 * however, decides a folder's index from a file whose slug ends in `/index`
 * (see quartz/util/fileTrie.ts). This transformer bridges the two conventions.
 *
 * THE RULE (case-insensitive — slugs are already lowercased by
 * slugifyFilePath, so matching `readme` is inherently case-insensitive):
 *
 *   A file whose slug's last segment is `readme` has that segment rewritten to
 *   `index` — i.e. `<folder>/readme` -> `<folder>/index` — but ONLY IF no other
 *   file already owns the slug `<folder>/index`.
 *
 * This single rule covers every case:
 *   - Subfolder with only README.md      -> becomes the folder page at /<folder>/
 *   - Folder with both index.md + README  -> index wins; README stays at /readme
 *   - Site root with Index.md + README.md -> `index` already exists, so the root
 *     README is left at /readme.
 *
 * PIPELINE ORDERING (why this works — the interesting part):
 *   Slugs are assigned from slugifyFilePath() in two places:
 *     1. build.ts populates ctx.allSlugs from the FULL file list, BEFORE any
 *        parsing. This drives the file trie, link resolution (crawl-links),
 *        folder-page and content-index.
 *     2. parse.ts sets file.data.slug per file, right before the markdown
 *        transformers run.
 *   The "no sibling index" check needs folder-level knowledge, so it must see
 *   the whole list. `markdownPlugins(ctx)` is invoked once per build with
 *   ctx.allSlugs ALREADY fully populated — that is our full-file-list stage.
 *   We compute the remap there and mutate ctx.allSlugs in place (the same array
 *   reference every downstream consumer uses in the main process), then the
 *   returned per-file transformer rewrites file.data.slug for the emit path.
 *
 *   Run this transformer early (a low `order`) so the remapped slug is
 *   authoritative before other plugins observe it.
 *
 *   Concurrency note: for large vaults Quartz may parse in worker threads with
 *   a serialized COPY of ctx.allSlugs; mutations to that copy would not reach
 *   the main process. In practice Quartz only uses workers above ~128 markdown
 *   files (quartz/processors/parse.ts). Below that it runs in-process, where
 *   this in-place mutation is authoritative.
 */

export interface ReadmeAsIndexOptions {
  /** The slug segment to treat as a folder README. Default: "readme". */
  readmeSlug?: string
}

const DEFAULT_OPTIONS: Required<ReadmeAsIndexOptions> = {
  readmeSlug: "readme",
}

/** Replace the last path segment of a slug with `index`. */
function toIndexSlug(slug: string): FullSlug {
  const lastSlash = slug.lastIndexOf("/")
  const prefix = lastSlash === -1 ? "" : slug.slice(0, lastSlash + 1)
  return (prefix + "index") as FullSlug
}

/** Last path segment of a slug (the "filename" part). */
function lastSegment(slug: string): string {
  return slug.slice(slug.lastIndexOf("/") + 1)
}

/**
 * Build the `<folder>/readme` -> `<folder>/index` remap from the full slug list,
 * honouring the "no sibling index" rule. Pure and order-independent.
 */
function buildRemap(allSlugs: readonly string[], readmeSlug: string): Map<string, FullSlug> {
  const existing = new Set(allSlugs)
  const remap = new Map<string, FullSlug>()
  for (const slug of allSlugs) {
    if (lastSegment(slug) !== readmeSlug) continue
    const target = toIndexSlug(slug)
    // Only remap when nothing else already owns the folder's index slug.
    if (existing.has(target)) continue
    remap.set(slug, target)
  }
  return remap
}

export const ReadmeAsIndex: QuartzTransformerPlugin<Partial<ReadmeAsIndexOptions>> = (userOpts) => {
  const opts = { ...DEFAULT_OPTIONS, ...userOpts }
  return {
    name: "ReadmeAsIndex",
    markdownPlugins(ctx: BuildCtx) {
      // ctx.allSlugs is the full, already-populated list at this point.
      const remap = buildRemap(ctx.allSlugs, opts.readmeSlug)

      // Apply the remap to ctx.allSlugs in place so the trie, crawl-links,
      // folder-page and content-index all resolve against the /index slug.
      if (remap.size > 0) {
        for (let i = 0; i < ctx.allSlugs.length; i++) {
          const mapped = remap.get(ctx.allSlugs[i])
          if (mapped) ctx.allSlugs[i] = mapped
        }
      }

      return [
        () => {
          return (_tree: Root, file: VFile) => {
            const slug = file.data.slug as FullSlug | undefined
            if (!slug) return
            const mapped = remap.get(slug)
            if (mapped) file.data.slug = mapped
          }
        },
      ]
    },
  }
}

export default ReadmeAsIndex
