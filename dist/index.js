// @jackerhack/quartz5-plugin-readme-as-index — runtime build (plain ESM).
//
// Kept as hand-written JS on purpose: the plugin has zero runtime dependencies
// (it only imports TYPES from @quartz-community/types, which are erased), so
// there is nothing to bundle. Quartz imports this file at runtime via a dynamic
// import() that esbuild leaves external, so the entry point must be plain .js.
// The authoritative, documented source is ../src/index.ts — keep them in sync.

/** Replace the last path segment of a slug with `index`. */
function toIndexSlug(slug) {
  const lastSlash = slug.lastIndexOf("/")
  const prefix = lastSlash === -1 ? "" : slug.slice(0, lastSlash + 1)
  return prefix + "index"
}

/** Last path segment of a slug (the "filename" part). */
function lastSegment(slug) {
  return slug.slice(slug.lastIndexOf("/") + 1)
}

/**
 * Build the `<folder>/readme` -> `<folder>/index` remap from the full slug list,
 * honouring the "no sibling index" rule. Pure and order-independent.
 */
function buildRemap(allSlugs, readmeSlug) {
  const existing = new Set(allSlugs)
  const remap = new Map()
  for (const slug of allSlugs) {
    if (lastSegment(slug) !== readmeSlug) continue
    const target = toIndexSlug(slug)
    if (existing.has(target)) continue
    remap.set(slug, target)
  }
  return remap
}

export const ReadmeAsIndex = (userOpts) => {
  const opts = { readmeSlug: "readme", ...userOpts }
  return {
    name: "ReadmeAsIndex",
    markdownPlugins(ctx) {
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
          return (_tree, file) => {
            const slug = file.data.slug
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
