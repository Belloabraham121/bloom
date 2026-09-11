import { generateObject, experimental_generateImage as generateImage } from "ai"
import { fetchUrlContent } from "@/lib/url-fetcher"

// Utility sleep function for rate limiting
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
import {
  type WorkflowInput,
  type ExtractedIdeas,
  type ChannelOutput,
  type Channel,
  ExtractedIdeasSchema,
  XThreadSchema,
  LinkedInSchema,
  EmailSchema,
  SEOSchema,
} from "@/lib/schemas"
import {
  EXTRACT_IDEAS_PROMPT,
  X_THREAD_PROMPT,
  LINKEDIN_PROMPT,
  EMAIL_PROMPT,
  SEO_PROMPT,
  IMAGE_PROMPT,
} from "@/lib/prompts"

// Step: Ingest and normalize content from sources
async function ingestContent(sources: WorkflowInput["sources"]): Promise<string> {
  
  const contents: string[] = []

  for (const source of sources) {
    if (source.type === "text") {
      contents.push(source.value)
    } else if (source.type === "pdf") {
      // PDF content is already extracted text from the client
      contents.push(source.value)
    } else if (source.type === "url") {
      try {
        const fetched = await fetchUrlContent(source.value)
        const formattedContent = [
          `# ${fetched.title}`,
          fetched.description ? `> ${fetched.description}` : "",
          fetched.author ? `Author: ${fetched.author}` : "",
          fetched.publishedDate ? `Published: ${fetched.publishedDate}` : "",
          `Source: ${fetched.url}`,
          "",
          fetched.mainContent,
        ]
          .filter(Boolean)
          .join("\n")
        contents.push(formattedContent)
      } catch (error) {
        console.error(`Failed to fetch URL: ${source.value}`, error)
        contents.push(`[Failed to fetch: ${source.value}]`)
      }
    }
  }

  return contents.join("\n\n---\n\n")
}

// Step: Extract key ideas from normalized content
async function extractIdeas(content: string): Promise<ExtractedIdeas> {
  
  const { object } = await generateObject({
    model: "openai/gpt-4o",
    schemaName: "ExtractedIdeasOutput",
    schemaDescription: "Key ideas extracted from content for multi-channel repurposing",
    schema: ExtractedIdeasSchema,
    system: EXTRACT_IDEAS_PROMPT,
    prompt: `Analyze this content and extract the key ideas:\n\n${content.slice(0, 8000)}`,
  })

  return object
}

// Step: Generate X Thread
async function generateXThread(ideas: ExtractedIdeas) {
  
  const { object } = await generateObject({
    model: "openai/gpt-4o",
    schemaName: "XThreadOutput",
    schemaDescription: "A Twitter/X thread with array of tweet contents",
    schema: XThreadSchema,
    system: X_THREAD_PROMPT(ideas),
    prompt: "Generate a viral X/Twitter thread based on the extracted ideas.",
  })

  return object
}

// Step: Generate LinkedIn Post
async function generateLinkedIn(ideas: ExtractedIdeas) {
  
  const { object } = await generateObject({
    model: "openai/gpt-4o",
    schemaName: "LinkedInPostOutput",
    schemaDescription: "A LinkedIn post with hook, body, CTA and hashtags",
    schema: LinkedInSchema,
    system: LINKEDIN_PROMPT(ideas),
    prompt: "Generate an engaging LinkedIn post based on the extracted ideas.",
  })

  return object
}

// Step: Generate Email Newsletter
async function generateEmail(ideas: ExtractedIdeas) {
  
  const { object } = await generateObject({
    model: "openai/gpt-4o",
    schemaName: "EmailNewsletterOutput",
    schemaDescription: "An email newsletter with subject, body and CTA",
    schema: EmailSchema,
    system: EMAIL_PROMPT(ideas),
    prompt: "Generate a newsletter email based on the extracted ideas.",
  })

  return object
}

// Step: Generate SEO Metadata
async function generateSEO(ideas: ExtractedIdeas) {
  
  const { object } = await generateObject({
    model: "openai/gpt-4o",
    schemaName: "SEOMetadataOutput",
    schemaDescription: "SEO metadata with title, description and keywords",
    schema: SEOSchema,
    system: SEO_PROMPT(ideas),
    prompt: "Generate SEO metadata based on the extracted ideas.",
  })

  return object
}

// Step: Generate a single base image using AI Gateway
async function generateBaseImage(
  visualConcept: string,
  style: WorkflowInput["imageStyle"],
  brandColor?: string
): Promise<string | undefined> {
  const effectiveStyle = style || "minimal"
  const prompt = IMAGE_PROMPT(visualConcept, effectiveStyle, "linkedin", brandColor)

  try {
    const { images } = await generateImage({
      model: "bfl/flux-2-pro",
      prompt,
      aspectRatio: "16:9", // Generate wide image as base
    })

    if (images && images.length > 0) {
      const image = images[0]
      return `data:${image.mediaType || "image/png"};base64,${image.base64}`
    }
  } catch (error) {
    console.error("Failed to generate base image:", error)
  }

  return undefined
}

// Crop image to channel-specific aspect ratio using canvas
async function cropImageForChannel(
  baseImageUrl: string,
  channel: Channel
): Promise<string> {
  // For server-side, we'll use sharp-like logic with canvas
  // Since we're in a Node.js environment, we return the base image
  // and let the client handle cropping if needed
  // For now, return the same image - the UI can handle display cropping
  return baseImageUrl
}

// Main workflow function
export async function runContentWorkflow(input: WorkflowInput): Promise<{
  normalizedContent: string
  extractedIdeas: ExtractedIdeas
  outputs: ChannelOutput[]
}> {

  // Step 1: Ingest content
  const normalizedContent = await ingestContent(input.sources)

  // Small delay to prevent rate limiting
  await sleep(1000)

  // Step 2: Extract ideas
  const extractedIdeas = await extractIdeas(normalizedContent)

  await sleep(1000)

  // Step 3: Generate content for each selected channel (in parallel for speed)
  const channelPromises: Promise<ChannelOutput>[] = []

  if (input.channels.includes("x-thread")) {
    channelPromises.push(
      generateXThread(extractedIdeas).then((content) => ({ channel: "x-thread" as const, content }))
    )
  }

  if (input.channels.includes("linkedin")) {
    channelPromises.push(
      generateLinkedIn(extractedIdeas).then((content) => ({ channel: "linkedin" as const, content }))
    )
  }

  if (input.channels.includes("email")) {
    channelPromises.push(
      generateEmail(extractedIdeas).then((content) => ({ channel: "email" as const, content }))
    )
  }

  if (input.channels.includes("seo")) {
    channelPromises.push(
      generateSEO(extractedIdeas).then((content) => ({ channel: "seo" as const, content }))
    )
  }

  const outputs = await Promise.all(channelPromises)

  // Step 4: Generate ONE image and apply to all channels
  if (input.generateImages) {
    await sleep(1000)
    
    const visualConcept = extractedIdeas.visualConcepts[0] || extractedIdeas.coreThesis
    
    // Generate a single base image (16:9 landscape)
    const baseImageUrl = await generateBaseImage(
      visualConcept,
      input.imageStyle,
      input.brandColor
    )
    
    // Apply the same image to all outputs
    // Each channel's UI component will handle display cropping via CSS
    for (const output of outputs) {
      output.imageUrl = baseImageUrl
    }
  }

  return {
    normalizedContent,
    extractedIdeas,
    outputs,
  }
}
