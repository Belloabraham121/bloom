import { z } from "zod"

// Input types
export const ContentSourceSchema = z.object({
  type: z.enum(["url", "text", "pdf"]),
  value: z.string(),
  metadata: z.object({
    filename: z.string(),
    pages: z.number(),
  }).optional(),
})

export const ImageStyleSchema = z.enum([
  "minimal",
  "illustration",
  "product",
  "abstract",
])

export const ChannelSchema = z.enum([
  "x-thread",
  "linkedin",
  "email",
  "seo",
])

export const WorkflowInputSchema = z.object({
  sources: z.array(ContentSourceSchema).min(1),
  channels: z.array(ChannelSchema).min(1),
  generateImages: z.boolean().default(false),
  imageStyle: ImageStyleSchema.optional(),
  brandColor: z.string().optional(),
})

// Extracted ideas schema
export const ExtractedIdeasSchema = z.object({
  coreThesis: z.string().describe("The main argument or insight"),
  keyPoints: z.array(z.string()).describe("3-5 supporting points"),
  hooks: z.array(z.string()).describe("Attention-grabbing opening lines"),
  targetAudience: z.string().describe("Who this content is for"),
  emotionalAngle: z.string().describe("The emotional tone to strike"),
  visualConcepts: z.array(z.string()).describe("Ideas for visual representation"),
})

// Channel output schemas - using flat arrays to avoid nested object schema issues
export const XThreadSchema = z.object({
  tweetContents: z.array(z.string().max(280)).describe("Array of tweet text contents in order"),
  hookIndex: z.number().describe("Index of the hook tweet (usually 0)"),
  summary: z.string().describe("Brief summary of the thread"),
}).strict()

export const LinkedInSchema = z.object({
  hook: z.string().describe("Opening line to stop the scroll"),
  body: z.string().describe("Main content with line breaks"),
  cta: z.string().describe("Call to action"),
  hashtags: z.array(z.string()).max(5).describe("Relevant hashtags"),
}).strict()

export const EmailSchema = z.object({
  subjectLine: z.string().describe("Email subject line"),
  previewText: z.string().max(100).describe("Preview text shown in inbox"),
  greeting: z.string().describe("Opening greeting"),
  body: z.string().describe("Main email body content"),
  ctaText: z.string().describe("CTA button text"),
  ctaContext: z.string().describe("Context around the CTA"),
  signoff: z.string().describe("Email sign off"),
}).strict()

export const SEOSchema = z.object({
  title: z.string().max(60).describe("SEO title tag"),
  metaDescription: z.string().max(160).describe("Meta description"),
  keywords: z.array(z.string()).describe("Target keywords"),
  ogTitle: z.string().describe("Open Graph title"),
  ogDescription: z.string().describe("Open Graph description"),
}).strict()

// Image prompt schema
export const ImagePromptSchema = z.object({
  platform: ChannelSchema,
  prompt: z.string(),
  aspectRatio: z.enum(["1:1", "16:9", "4:3"]),
  style: ImageStyleSchema,
})

// Final output schema
export const ChannelOutputSchema = z.object({
  channel: ChannelSchema,
  content: z.union([XThreadSchema, LinkedInSchema, EmailSchema, SEOSchema]),
  imageUrl: z.string().optional(),
})

export const WorkflowOutputSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  currentStep: z.string().optional(),
  outputs: z.array(ChannelOutputSchema).optional(),
  normalizedContent: z.string().optional(),
  extractedIdeas: ExtractedIdeasSchema.optional(),
  error: z.string().optional(),
})

// Type exports
export type ContentSource = z.infer<typeof ContentSourceSchema>
export type ImageStyle = z.infer<typeof ImageStyleSchema>
export type Channel = z.infer<typeof ChannelSchema>
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>
export type ExtractedIdeas = z.infer<typeof ExtractedIdeasSchema>
export type XThread = z.infer<typeof XThreadSchema>
export type LinkedIn = z.infer<typeof LinkedInSchema>
export type Email = z.infer<typeof EmailSchema>
export type SEO = z.infer<typeof SEOSchema>
export type ImagePrompt = z.infer<typeof ImagePromptSchema>
export type ChannelOutput = z.infer<typeof ChannelOutputSchema>
export type WorkflowOutput = z.infer<typeof WorkflowOutputSchema>
