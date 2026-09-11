"use client"

import React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import type { Channel } from "@/lib/schemas"
import { Twitter, Linkedin, Mail, Search, CheckCircle2 } from "lucide-react"

interface ChannelOptionsProps {
  selectedChannels: Channel[]
  onChannelsChange: (channels: Channel[]) => void
}

const CHANNELS: Array<{
  id: Channel
  label: string
  icon: React.ReactNode
  description: string
}> = [
  {
    id: "x-thread",
    label: "X Thread",
    icon: <Twitter className="h-4 w-4" />,
    description: "5-8 tweet thread",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: <Linkedin className="h-4 w-4" />,
    description: "Professional post",
  },
  {
    id: "email",
    label: "Email",
    icon: <Mail className="h-4 w-4" />,
    description: "Newsletter format",
  },
  {
    id: "seo",
    label: "SEO",
    icon: <Search className="h-4 w-4" />,
    description: "Meta & OG tags",
  },
]

export function ChannelOptions({
  selectedChannels,
  onChannelsChange,
}: ChannelOptionsProps) {
  const toggleChannel = (channel: Channel) => {
    if (selectedChannels.includes(channel)) {
      onChannelsChange(selectedChannels.filter((c) => c !== channel))
    } else {
      onChannelsChange([...selectedChannels, channel])
    }
  }

  const selectAll = () => {
    onChannelsChange(CHANNELS.map((c) => c.id))
  }

  const allSelected = selectedChannels.length === CHANNELS.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Output Channels</span>
        <button
          type="button"
          onClick={selectAll}
          disabled={allSelected}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <CheckCircle2 className="h-3 w-3" />
          {allSelected ? "All selected" : "Select all"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CHANNELS.map((channel) => {
          const isSelected = selectedChannels.includes(channel.id)
          return (
            <label
              key={channel.id}
              className={`group flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-all ${
                isSelected
                  ? "border-foreground/40 bg-muted"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleChannel(channel.id)}
                className="sr-only"
              />
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors ${
                  isSelected ? "bg-foreground text-background" : "bg-accent text-muted-foreground"
                }`}
              >
                {channel.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">{channel.label}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {channel.description}
                </div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )
}
