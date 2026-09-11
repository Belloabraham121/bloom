"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Twitter, Linkedin, Mail, Search, Copy, Check, ImageIcon, Eye, Download } from "lucide-react"
import { XPreviewModal } from "@/components/x-preview-modal"
import { LinkedInPreviewModal } from "@/components/linkedin-preview-modal"
import type { ChannelOutput, XThread, LinkedIn, Email, SEO } from "@/lib/schemas"

interface OutputDisplayProps {
  outputs: ChannelOutput[]
}

const channelMeta = {
  "x-thread": { icon: Twitter, label: "X Thread" },
  linkedin: { icon: Linkedin, label: "LinkedIn" },
  email: { icon: Mail, label: "Email" },
  seo: { icon: Search, label: "SEO" },
}

export function OutputDisplay({ outputs }: OutputDisplayProps) {
  const [activeTab, setActiveTab] = useState(outputs[0]?.channel || "")
  const [copiedChannel, setCopiedChannel] = useState<string | null>(null)
  const [xPreviewOpen, setXPreviewOpen] = useState(false)
  const [linkedInPreviewOpen, setLinkedInPreviewOpen] = useState(false)

  const handlePreview = () => {
    if (activeTab === "x-thread") setXPreviewOpen(true)
    else if (activeTab === "linkedin") setLinkedInPreviewOpen(true)
  }

  const handleDownload = async (imageUrl: string, channel: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${channel}-image.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Download failed:", error)
    }
  }

  const copyToClipboard = async (text: string, channel: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedChannel(channel)
    setTimeout(() => setCopiedChannel(null), 2000)
  }

  if (outputs.length === 0) return null

  const xOutput = outputs.find(o => o.channel === "x-thread")
  const linkedInOutput = outputs.find(o => o.channel === "linkedin")

  return (
    <>
      <Tabs defaultValue={outputs[0]?.channel} value={activeTab} onValueChange={setActiveTab} className="w-full animate-blur-reveal">
        <div className="flex items-center justify-between border-b">
          <TabsList className="h-auto w-auto justify-start gap-1 rounded-none bg-transparent p-0">
            {outputs.map((output) => {
              const meta = channelMeta[output.channel]
              const Icon = meta.icon
              return (
                <TabsTrigger
                  key={output.channel}
                  value={output.channel}
                  className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Icon className="h-4 w-4" />
                  {meta.label}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {(activeTab === "x-thread" || activeTab === "linkedin") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              className="mr-2 gap-2 bg-transparent"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </Button>
          )}
        </div>

        {outputs.map((output) => (
          <TabsContent key={output.channel} value={output.channel} className="mt-6">
            <div className="space-y-6 blur-reveal-stagger">
              {output.imageUrl && (
                <div className="overflow-hidden rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Generated Image</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownload(output.imageUrl!, output.channel)}
                      className="gap-2 bg-transparent"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </div>
                  <div className="p-4">
                    <img
                      src={output.imageUrl || "/placeholder.svg"}
                      alt={`Generated for ${output.channel}`}
                      className="max-w-md rounded-md"
                    />
                  </div>
                </div>
              )}

              {output.channel === "x-thread" && (
                <XThreadOutput
                  content={output.content as XThread}
                  imageUrl={output.imageUrl}
                  onCopy={(text) => copyToClipboard(text, "x-thread")}
                  copied={copiedChannel === "x-thread"}
                />
              )}
              {output.channel === "linkedin" && (
                <LinkedInOutput
                  content={output.content as LinkedIn}
                  imageUrl={output.imageUrl}
                  onCopy={(text) => copyToClipboard(text, "linkedin")}
                  copied={copiedChannel === "linkedin"}
                />
              )}
              {output.channel === "email" && (
                <EmailOutput
                  content={output.content as Email}
                  onCopy={(text) => copyToClipboard(text, "email")}
                  copied={copiedChannel === "email"}
                />
              )}
              {output.channel === "seo" && (
                <SEOOutput
                  content={output.content as SEO}
                  onCopy={(text) => copyToClipboard(text, "seo")}
                  copied={copiedChannel === "seo"}
                />
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Preview Modals */}
      {xOutput && (
        <XPreviewModal
          open={xPreviewOpen}
          onOpenChange={setXPreviewOpen}
          content={xOutput.content as XThread}
          imageUrl={xOutput.imageUrl}
        />
      )}
      {linkedInOutput && (
        <LinkedInPreviewModal
          open={linkedInPreviewOpen}
          onOpenChange={setLinkedInPreviewOpen}
          content={linkedInOutput.content as LinkedIn}
          imageUrl={linkedInOutput.imageUrl}
        />
      )}
    </>
  )
}

function CopyButton({
  onClick,
  copied,
}: {
  onClick: () => void
  copied: boolean
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="gap-2 bg-transparent"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}



function XThreadOutput({
  content,
  imageUrl,
  onCopy,
  copied,
}: {
  content: XThread
  imageUrl?: string
  onCopy: (text: string) => void
  copied: boolean
}) {
  const fullThread = content.tweetContents
    .map((t, i) => `${i + 1}/ ${t}`)
    .join("\n\n")

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <span className="text-sm font-medium">
            Thread ({content.tweetContents.length} tweets)
          </span>
          <p className="text-xs text-muted-foreground">{content.summary}</p>
        </div>
        <CopyButton onClick={() => onCopy(fullThread)} copied={copied} />
      </div>
      <div className="divide-y">
        {content.tweetContents.map((tweetContent, index) => (
          <div
            key={index}
            className={`p-4 ${index === content.hookIndex ? "bg-muted/30" : ""}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {index + 1}/{content.tweetContents.length}
                </span>
                {index === content.hookIndex && (
                  <span className="rounded bg-foreground px-1.5 py-0.5 text-background">
                    Hook
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {tweetContent.length}/280
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {tweetContent}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkedInOutput({
  content,
  imageUrl,
  onCopy,
  copied,
}: {
  content: LinkedIn
  imageUrl?: string
  onCopy: (text: string) => void
  copied: boolean
}) {
  const fullPost = `${content.hook}\n\n${content.body}\n\n${content.cta}\n\n${content.hashtags.map((h) => `#${h}`).join(" ")}`

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">LinkedIn Post</span>
        <CopyButton onClick={() => onCopy(fullPost)} copied={copied} />
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-md bg-muted/30 p-4">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Hook
          </span>
          <p className="text-sm font-medium leading-relaxed">{content.hook}</p>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Body
          </span>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content.body}
          </p>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Call to Action
          </span>
          <p className="text-sm leading-relaxed">{content.cta}</p>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {content.hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmailOutput({
  content,
  onCopy,
  copied,
}: {
  content: Email
  onCopy: (text: string) => void
  copied: boolean
}) {
  const fullEmail = `Subject: ${content.subjectLine}\nPreview: ${content.previewText}\n\n${content.greeting}\n\n${content.body}\n\n${content.ctaText}\n\n${content.signoff}`

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">Email Newsletter</span>
        <CopyButton onClick={() => onCopy(fullEmail)} copied={copied} />
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md bg-muted/30 p-4">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Subject Line
            </span>
            <p className="text-sm font-medium">{content.subjectLine}</p>
          </div>
          <div className="rounded-md border p-4">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preview Text
            </span>
            <p className="text-sm text-muted-foreground">{content.previewText}</p>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Greeting
          </span>
          <p className="text-sm">{content.greeting}</p>
        </div>

        <div className="rounded-md border p-4">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Body
          </span>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {content.body}
          </p>
        </div>

        <div className="rounded-md bg-foreground/5 p-4">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            CTA Button
          </span>
          <p className="text-sm font-medium">{content.ctaText}</p>
          <p className="mt-1 text-xs text-muted-foreground">{content.ctaContext}</p>
        </div>

        <div className="rounded-md border p-4">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sign-off
          </span>
          <p className="text-sm">{content.signoff}</p>
        </div>
      </div>
    </div>
  )
}

function SEOOutput({
  content,
  onCopy,
  copied,
}: {
  content: SEO
  onCopy: (text: string) => void
  copied: boolean
}) {
  const fullSEO = `Title: ${content.title}\nMeta Description: ${content.metaDescription}\nKeywords: ${content.keywords.join(", ")}\nOG Title: ${content.ogTitle}\nOG Description: ${content.ogDescription}`

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-medium">SEO Metadata</span>
        <CopyButton onClick={() => onCopy(fullSEO)} copied={copied} />
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-md border p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Title Tag
            </span>
            <span
              className={`font-mono text-xs ${content.title.length > 60 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {content.title.length}/60
            </span>
          </div>
          <p className="text-sm font-medium">{content.title}</p>
        </div>

        <div className="rounded-md border p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Meta Description
            </span>
            <span
              className={`font-mono text-xs ${content.metaDescription.length > 160 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {content.metaDescription.length}/160
            </span>
          </div>
          <p className="text-sm leading-relaxed">{content.metaDescription}</p>
        </div>

        <div className="rounded-md border p-4">
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Keywords
          </span>
          <div className="flex flex-wrap gap-2">
            {content.keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border p-4">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              OG Title
            </span>
            <p className="text-sm font-medium">{content.ogTitle}</p>
          </div>
          <div className="rounded-md border p-4">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              OG Description
            </span>
            <p className="text-sm">{content.ogDescription}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
