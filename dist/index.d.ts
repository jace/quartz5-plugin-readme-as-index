import type { QuartzTransformerPlugin } from "@quartz-community/types"

export interface ReadmeAsIndexOptions {
  /** The slug segment to treat as a folder README. Default: "readme". */
  readmeSlug?: string
}

/**
 * Transformer: rewrites `<folder>/readme` slugs to `<folder>/index` (unless a
 * sibling index already exists) and makes a titleless README adopt the folder
 * name, exactly like index.md.
 */
export declare const ReadmeAsIndex: QuartzTransformerPlugin<Partial<ReadmeAsIndexOptions>>
export default ReadmeAsIndex
