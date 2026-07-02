import type { QuartzTransformerPlugin } from "@quartz-community/types"

export interface ReadmeAsIndexOptions {
  /** The slug segment to treat as a folder README. Default: "readme". */
  readmeSlug?: string
}

export declare const ReadmeAsIndex: QuartzTransformerPlugin<Partial<ReadmeAsIndexOptions>>
export default ReadmeAsIndex
