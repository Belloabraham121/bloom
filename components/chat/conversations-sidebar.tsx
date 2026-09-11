"use client"

import { MessageSquarePlus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Conversation } from "@/lib/conversations"

interface ConversationsSidebarProps {
  open: boolean
  onClose: () => void
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function ConversationsSidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationsSidebarProps) {
  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close conversations"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      {/* Semi-detached floating panel */}
      <aside
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur-md transition-all duration-300 ease-out",
          "top-3 bottom-3 left-3 w-[min(100%-1.5rem,20rem)] sm:top-4 sm:bottom-4 sm:left-4 sm:w-80",
          open
            ? "translate-x-0 opacity-100"
            : "-translate-x-[110%] opacity-0 pointer-events-none"
        )}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Conversations
            </p>
            <p className="text-sm text-foreground/80">Your chats</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={onNew}
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="New conversation"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-9 w-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close sidebar"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <Button
                variant="outline"
                size="sm"
                onClick={onNew}
                className="mt-4 rounded-full border-border bg-transparent"
              >
                Start a chat
              </Button>
            </div>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => {
                const active = conversation.id === activeId
                return (
                  <li key={conversation.id}>
                    <div
                      className={cn(
                        "group flex items-start gap-1 rounded-xl border border-transparent p-1 transition-colors",
                        active
                          ? "border-border bg-muted/70"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(conversation.id)
                          onClose()
                        }}
                        className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left"
                      >
                        <p className="truncate text-sm text-foreground/90">
                          {conversation.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRelative(conversation.updatedAt)}
                          {conversation.messages.length > 0
                            ? ` · ${conversation.messages.length} msgs`
                            : ""}
                        </p>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDelete(conversation.id)}
                        className="mt-1 h-8 w-8 shrink-0 rounded-full opacity-0 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        aria-label={`Delete ${conversation.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border/80 px-4 py-3">
          <Button
            onClick={onNew}
            className="w-full rounded-full"
            size="sm"
          >
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            New conversation
          </Button>
        </div>
      </aside>
    </>
  )
}
