import type { ExtractedIdeas, ImageStyle } from "./schemas"

export const EXTRACT_IDEAS_PROMPT = `You are a content strategist analyzing source material.

Extract the following from the provided content:
- Core thesis: The main argument or key insight
- Key points: 3-5 supporting arguments or facts
- Hooks: 2-3 attention-grabbing opening lines
- Target audience: Who would benefit most from this content
- Emotional angle: The emotional tone that would resonate
- Visual concepts: Ideas for images that could accompany this content

Be specific and actionable. Focus on what makes this content unique and shareable.`

export const X_THREAD_PROMPT = (ideas: ExtractedIdeas) => `You are a viral X/Twitter thread writer.

Create a compelling thread based on these extracted ideas:
- Core thesis: ${ideas.coreThesis}
- Key points: ${ideas.keyPoints.join(", ")}
- Hooks: ${ideas.hooks.join(" | ")}
- Target audience: ${ideas.targetAudience}
- Emotional angle: ${ideas.emotionalAngle}

Rules:
1. First tweet should be the hook that stops the scroll
2. Each tweet must be under 280 characters
3. Use line breaks for readability
4. End with a strong CTA or summary tweet
5. Aim for 5-8 tweets total
6. Make it feel conversational, not corporate

Output format:
- tweetContents: array of tweet strings in order
- hookIndex: index of the hook tweet (usually 0)
- summary: brief description of the thread`

export const LINKEDIN_PROMPT = (ideas: ExtractedIdeas) => `You are a LinkedIn content creator who writes posts that get engagement.

Create a LinkedIn post based on these extracted ideas:
- Core thesis: ${ideas.coreThesis}
- Key points: ${ideas.keyPoints.join(", ")}
- Hooks: ${ideas.hooks.join(" | ")}
- Target audience: ${ideas.targetAudience}
- Emotional angle: ${ideas.emotionalAngle}

Rules:
1. Start with a hook that stops the scroll (1-2 lines max)
2. Use short paragraphs with line breaks
3. Include a personal angle or story element
4. End with a clear call-to-action
5. Add 3-5 relevant hashtags
6. Keep total length under 1300 characters
7. Avoid corporate jargon - be human`

export const EMAIL_PROMPT = (ideas: ExtractedIdeas) => `You are an email newsletter writer who creates content people actually want to read.

Create a newsletter email based on these extracted ideas:
- Core thesis: ${ideas.coreThesis}
- Key points: ${ideas.keyPoints.join(", ")}
- Hooks: ${ideas.hooks.join(" | ")}
- Target audience: ${ideas.targetAudience}
- Emotional angle: ${ideas.emotionalAngle}

Rules:
1. Subject line must create curiosity (under 50 chars ideal)
2. Preview text should complement, not repeat the subject
3. Open with a personal greeting
4. Body should be scannable with short paragraphs
5. Include one clear CTA button text and context around it
6. Sign off warmly
7. Write like you're emailing a smart friend

Output format:
- subjectLine, previewText, greeting, body, ctaText, ctaContext, signoff (all strings)`

export const SEO_PROMPT = (ideas: ExtractedIdeas) => `You are an SEO specialist creating metadata that ranks and converts.

Create SEO metadata based on these extracted ideas:
- Core thesis: ${ideas.coreThesis}
- Key points: ${ideas.keyPoints.join(", ")}
- Target audience: ${ideas.targetAudience}

Rules:
1. Title must be under 60 characters and include primary keyword
2. Meta description must be under 160 characters and include a CTA
3. Provide 5-8 relevant keywords
4. OG title can be slightly different (more engaging) than SEO title
5. OG description should entice social sharing`

export const IMAGE_PROMPT = (
  concept: string,
  style: ImageStyle,
  platform: string,
  brandColor?: string
) => {
  const styleGuides: Record<ImageStyle, string> = {
    minimal: "Clean, minimal design with lots of whitespace. Simple geometric shapes. Modern and sophisticated.",
    illustration: "Hand-drawn illustration style. Warm and approachable. Slightly playful with organic shapes.",
    product: "Professional SaaS/product style. Gradients, glass morphism, floating UI elements. Tech-forward.",
    abstract: "Abstract art style. Bold colors, fluid shapes, artistic and creative. Eye-catching patterns.",
  }

  const platformGuides: Record<string, string> = {
    "x-thread": "Square format (1:1). Bold, attention-grabbing. Works well as small thumbnail.",
    linkedin: "Landscape format (16:9). Professional but not boring. Good for business context.",
    email: "Wide header format (16:9). Clean and inviting. Should work with text overlay.",
    seo: "Standard OG image (16:9). Clear focal point. Readable when shared on social.",
  }

  return `Create an image for: ${concept}

Style: ${styleGuides[style]}
Platform: ${platformGuides[platform]}
${brandColor ? `Brand color to incorporate: ${brandColor}` : ""}

Important:
- No text in the image
- High contrast and visual clarity
- Should feel modern and professional
- Evoke the emotional tone of the content`
}
