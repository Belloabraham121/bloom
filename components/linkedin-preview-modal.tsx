"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MoreHorizontal, ThumbsUp, MessageSquare, Repeat, Send, Globe } from "lucide-react"
import type { LinkedIn } from "@/lib/schemas"

interface LinkedInPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: LinkedIn
  imageUrl?: string
}

export function LinkedInPreviewModal({ open, onOpenChange, content, imageUrl }: LinkedInPreviewModalProps) {
  const fullPost = `${content.hook}\n\n${content.body}\n\n${content.cta}\n\n${content.hashtags.map(h => `#${h}`).join(" ")}`
  
  const mockEngagement = {
    reactions: Math.floor(Math.random() * 200) + 30,
    comments: Math.floor(Math.random() * 30) + 5,
    reposts: Math.floor(Math.random() * 20) + 2,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:rounded-lg">
        <DialogHeader className="border-b border-[#38434f] bg-[#1b1f23] px-4 py-3">
          <DialogTitle className="text-center text-base font-semibold text-white">LinkedIn Preview</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[70vh] bg-[#1b1f23]">
          {/* Post Card */}
          <div className="border-b border-[#38434f] bg-[#1b1f23]">
            {/* Header */}
            <div className="flex items-start gap-3 p-4 pb-0">
              <div className="h-12 w-12 shrink-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-700" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-white hover:text-[#70b5f9] hover:underline">Your Name</span>
                  <span className="text-[13px] text-[#70b5f9]">• 1st</span>
                </div>
                <p className="truncate text-[13px] text-[#ffffffb3]">Your professional headline goes here</p>
                <div className="flex items-center gap-1 text-[12px] text-[#ffffff99]">
                  <span>Just now</span>
                  <span>•</span>
                  <Globe className="h-3 w-3" />
                </div>
              </div>
              <button className="rounded-full p-2 text-[#ffffff99] transition-colors hover:bg-[#ffffff14]">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-4 py-3">
              <p className="whitespace-pre-wrap text-[14px] leading-[1.42] text-[#ffffffe6]">
                {fullPost}
              </p>
            </div>

            {/* Image */}
            {imageUrl && (
              <div className="border-y border-[#38434f]">
                <img src={imageUrl} alt="Post image" className="w-full" />
              </div>
            )}

            {/* Engagement stats */}
            <div className="flex items-center justify-between px-4 py-2 text-[12px] text-[#ffffff99]">
              <div className="flex items-center gap-1">
                <div className="flex -space-x-1">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#378fe9]">
                    <ThumbsUp className="h-2.5 w-2.5 fill-white text-white" />
                  </div>
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e16745]">
                    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-white">
                      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.5 8.9c-.2.6-.6 1.1-1.2 1.4-.6.3-1.4.4-2.3.4-.9 0-1.7-.1-2.3-.4-.6-.3-1-.8-1.2-1.4-.1-.2-.1-.4-.1-.6 0-.1 0-.2.1-.3.1-.1.2-.1.3-.1h6.4c.1 0 .2 0 .3.1.1.1.1.2.1.3 0 .2 0 .4-.1.6z" />
                    </svg>
                  </div>
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#6dae4f]">
                    <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-white">
                      <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm-2-5v-1l4-4 1 1-4 4h-1z" />
                    </svg>
                  </div>
                </div>
                <span className="hover:text-[#70b5f9] hover:underline">{mockEngagement.reactions}</span>
              </div>
              <div className="flex gap-2">
                <span className="hover:text-[#70b5f9] hover:underline">{mockEngagement.comments} comments</span>
                <span>•</span>
                <span className="hover:text-[#70b5f9] hover:underline">{mockEngagement.reposts} reposts</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex border-t border-[#38434f] px-2 py-1">
              <button className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[#ffffffb3] transition-colors hover:bg-[#ffffff14]">
                <ThumbsUp className="h-5 w-5" />
                <span className="text-[14px] font-semibold">Like</span>
              </button>
              <button className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[#ffffffb3] transition-colors hover:bg-[#ffffff14]">
                <MessageSquare className="h-5 w-5" />
                <span className="text-[14px] font-semibold">Comment</span>
              </button>
              <button className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[#ffffffb3] transition-colors hover:bg-[#ffffff14]">
                <Repeat className="h-5 w-5" />
                <span className="text-[14px] font-semibold">Repost</span>
              </button>
              <button className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-[#ffffffb3] transition-colors hover:bg-[#ffffff14]">
                <Send className="h-5 w-5" />
                <span className="text-[14px] font-semibold">Send</span>
              </button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
