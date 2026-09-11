"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MoreHorizontal, MessageCircle, Repeat2, Heart, BarChart2, Bookmark, Share } from "lucide-react"
import type { XThread } from "@/lib/schemas"

interface XPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: XThread
  imageUrl?: string
}

export function XPreviewModal({ open, onOpenChange, content, imageUrl }: XPreviewModalProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + "K"
    return num.toString()
  }

  const mockEngagement = {
    replies: Math.floor(Math.random() * 50) + 5,
    reposts: Math.floor(Math.random() * 200) + 20,
    likes: Math.floor(Math.random() * 500) + 50,
    views: Math.floor(Math.random() * 10000) + 1000,
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-[#2f3336] bg-black px-4 py-3">
          <DialogTitle className="text-center text-base font-bold text-white">Thread Preview</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[70vh] bg-black">
          <div className="divide-y divide-[#2f3336]">
            {content.tweetContents.map((tweet, index) => (
              <div key={index} className="px-4 py-3">
                <div className="flex gap-3">
                  {/* Avatar */}
                  <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
                    {index < content.tweetContents.length - 1 && (
                      <div className="mt-1 w-0.5 flex-1 bg-[#2f3336]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-1">
                      <span className="truncate font-bold text-white">Your Name</span>
                      <svg viewBox="0 0 22 22" className="h-4 w-4 fill-[#1d9bf0]">
                        <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681.132-.637.075-1.299-.165-1.903.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816zM9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z" />
                      </svg>
                      <span className="text-[#71767b]">@yourhandle</span>
                      <span className="text-[#71767b]">·</span>
                      <span className="text-[#71767b]">now</span>
                      <button className="ml-auto rounded-full p-1.5 text-[#71767b] transition-colors hover:bg-[#1d9bf0]/10 hover:text-[#1d9bf0]">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Tweet text */}
                    <p className="mt-1 whitespace-pre-wrap text-[15px] leading-normal text-white">
                      {tweet}
                    </p>

                    {/* Image (only on first tweet if available) */}
                    {index === 0 && imageUrl && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-[#2f3336]">
                        <img src={imageUrl} alt="Post image" className="w-full" />
                      </div>
                    )}

                    {/* Engagement */}
                    <div className="mt-3 flex max-w-md justify-between text-[13px] text-[#71767b]">
                      <button className="group flex items-center gap-1 transition-colors hover:text-[#1d9bf0]">
                        <div className="rounded-full p-2 transition-colors group-hover:bg-[#1d9bf0]/10">
                          <MessageCircle className="h-4 w-4" />
                        </div>
                        <span>{formatNumber(mockEngagement.replies)}</span>
                      </button>
                      <button className="group flex items-center gap-1 transition-colors hover:text-[#00ba7c]">
                        <div className="rounded-full p-2 transition-colors group-hover:bg-[#00ba7c]/10">
                          <Repeat2 className="h-4 w-4" />
                        </div>
                        <span>{formatNumber(mockEngagement.reposts)}</span>
                      </button>
                      <button className="group flex items-center gap-1 transition-colors hover:text-[#f91880]">
                        <div className="rounded-full p-2 transition-colors group-hover:bg-[#f91880]/10">
                          <Heart className="h-4 w-4" />
                        </div>
                        <span>{formatNumber(mockEngagement.likes)}</span>
                      </button>
                      <button className="group flex items-center gap-1 transition-colors hover:text-[#1d9bf0]">
                        <div className="rounded-full p-2 transition-colors group-hover:bg-[#1d9bf0]/10">
                          <BarChart2 className="h-4 w-4" />
                        </div>
                        <span>{formatNumber(mockEngagement.views)}</span>
                      </button>
                      <div className="flex">
                        <button className="rounded-full p-2 text-[#71767b] transition-colors hover:bg-[#1d9bf0]/10 hover:text-[#1d9bf0]">
                          <Bookmark className="h-4 w-4" />
                        </button>
                        <button className="rounded-full p-2 text-[#71767b] transition-colors hover:bg-[#1d9bf0]/10 hover:text-[#1d9bf0]">
                          <Share className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
