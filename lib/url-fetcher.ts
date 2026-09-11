import * as cheerio from "cheerio"

export interface FetchedContent {
  title: string
  description: string
  author?: string
  publishedDate?: string
  mainContent: string
  url: string
}

const CONTENT_SELECTORS = [
  "article",
  "main",
  '[role="main"]',
  ".post-content",
  ".article-content",
  ".entry-content",
  ".content",
  "#content",
  ".post",
  ".blog-post",
]

const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "nav",
  "header",
  "footer",
  "aside",
  ".sidebar",
  ".nav",
  ".navigation",
  ".menu",
  ".footer",
  ".header",
  ".advertisement",
  ".ads",
  ".ad",
  ".social-share",
  ".comments",
  ".comment",
  ".related-posts",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
]

export async function fetchUrlContent(url: string): Promise<FetchedContent> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ContentBot/1.0; +https://example.com/bot)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)

  // Remove unwanted elements
  REMOVE_SELECTORS.forEach((selector) => $(selector).remove())

  // Extract metadata
  const title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    ""

  const description =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    ""

  const author =
    $('meta[name="author"]').attr("content") ||
    $('meta[property="article:author"]').attr("content") ||
    $('[rel="author"]').text().trim() ||
    $(".author").first().text().trim() ||
    undefined

  const publishedDate =
    $('meta[property="article:published_time"]').attr("content") ||
    $("time").attr("datetime") ||
    undefined

  // Extract main content
  let mainContent = ""

  // Try content selectors in order of priority
  for (const selector of CONTENT_SELECTORS) {
    const element = $(selector).first()
    if (element.length > 0) {
      mainContent = extractTextFromElement($, element)
      if (mainContent.length > 200) break
    }
  }

  // Fallback: extract from body if no content found
  if (mainContent.length < 200) {
    mainContent = extractTextFromElement($, $("body"))
  }

  // Clean up the content
  mainContent = cleanText(mainContent)

  // Limit content length (15KB for better AI context)
  if (mainContent.length > 15000) {
    mainContent = mainContent.slice(0, 15000) + "..."
  }

  return {
    title,
    description,
    author,
    publishedDate,
    mainContent,
    url,
  }
}

function extractTextFromElement(
  $: cheerio.CheerioAPI,
  element: cheerio.Cheerio<cheerio.Element>
): string {
  const textParts: string[] = []

  // Extract headings and paragraphs with structure
  element.find("h1, h2, h3, h4, h5, h6, p, li, blockquote").each((_, el) => {
    const $el = $(el)
    const tagName = el.tagName.toLowerCase()
    const text = $el.text().trim()

    if (text) {
      if (tagName.startsWith("h")) {
        textParts.push(`\n## ${text}\n`)
      } else if (tagName === "blockquote") {
        textParts.push(`> ${text}`)
      } else {
        textParts.push(text)
      }
    }
  })

  // If no structured content, fall back to all text
  if (textParts.length === 0) {
    return element.text()
  }

  return textParts.join("\n\n")
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/\n{3,}/g, "\n\n") // Max 2 newlines
    .replace(/\t/g, " ") // Remove tabs
    .trim()
}
