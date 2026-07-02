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
 * (see quartz/util/fileTrie.ts). This plugin makes a folder's README behave
 * exactly like an `index.md` would when that file is absent — nothing more.
 * It does NOT add publishing/pruning semantics of its own: `publish`, `draft`,
 * etc. flow through Quartz's existing per-file filters exactly as they would for
 * an index.md, because the README simply becomes that index.
 *
 * THE SLUG RULE (case-insensitive — slugs are already lowercased by
 * slugifyFilePath, so matching `readme` is inherently case-insensitive):
 *
 *   A file whose slug's last segment is `readme` has that segment rewritten to
 *   `index` — i.e. `<folder>/readme` -> `<folder>/index` — but ONLY IF no other
 *   file already owns the slug `<folder>/index`.
 *
 *   - Subfolder with only README.md      -> becomes the folder page at /<folder>/
 *   - Folder with both index.md + README  -> index wins; README stays at /readme
 *   - Site root with Index.md + README.md -> `index` already exists, so the root
 *     README is left at /readme.
 *
 * TITLE:
 *   Quartz's note-properties transformer falls back to the file's stem when a
 *   note has no `title` frontmatter, so a titleless README would show "README".
 *   For a real index.md the fallback is "index", which folder-page then swaps
 *   for the (properly-cased) folder name. We reproduce that: once note-properties
 *   has run, if a remapped README has no explicit title (its title still equals
 *   its stem), we set the title to "index" so folder-page substitutes the folder
 *   name — just like index.md. An explicit `title:` in the README is preserved.
 *
 * PIPELINE ORDERING (why this works — the interesting part):
 *   Slugs are assigned from slugifyFilePath() in two places:
 *     1. build.ts populates ctx.allSlugs from the FULL file list, BEFORE any
 *        parsing. This drives the file trie, link resolution (crawl-links),
 *        folder-page and content-index.
 *     2. parse.ts sets file.data.slug per file, right before the markdown
 *        transformers run.
 *   The "no sibling index" check needs the whole list. markdownPlugins(ctx) is
 *   invoked once per build with ctx.allSlugs ALREADY fully populated — that is
 *   our full-file-list stage. We compute the remap there, mutate ctx.allSlugs in
 *   place (the same array every downstream consumer uses in the main process),
 *   and the returned per-file transformer rewrites file.data.slug for emit.
 *   Run this transformer early (low `order`) so the remapped slug is
 *   authoritative before other plugins observe it.
 *
 *   Concurrency note: for large vaults Quartz parses in worker threads with a
 *   serialized COPY of ctx.allSlugs; mutations to that copy would not reach the
 *   main process. Quartz only uses workers above ~128 markdown files
 *   (quartz/processors/parse.ts). Below that it runs in-process, where the
 *   in-place mutation is authoritative. (file.data.slug always persists.)
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
            if (mapped) {
              file.data.slug = mapped
              // Mark so the html phase can normalise the title like index.md.
              file.data.readmeAsIndex = true
            }
          }
        },
      ]
    },
    htmlPlugins(_ctx: BuildCtx) {
      return [
        () => {
          return (_tree: Root, file: VFile) => {
            // Title only: make a remapped README behave like index.md.
            // note-properties has already set frontmatter.title (to the stem when
            // none was given), so if the title is still the README's stem, defer
            // to folder-page by marking it "index"; an explicit title is kept.
            if (!file.data.readmeAsIndex) return
            const frontmatter = file.data.frontmatter as Record<string, unknown> | undefined
            if (frontmatter && frontmatter.title === file.stem) {
              frontmatter.title = "index"
            }
          }
        },
      ]
    },
  }
}

export default ReadmeAsIndex

declare module "vfile" {
  interface DataMap {
    readmeAsIndex: boolean
  }
}
