"use client"

import type React from "react"
import { useState, useRef, useCallback, type KeyboardEvent, useEffect } from "react"
import { Square, Mic, MicOff, Brain, Paperclip, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu"
import Image from "next/image"
import { AnimatedOrb } from "./animated-orb"
import { AudioWaveform } from "./audio-waveform"

export type AIModel =
  | "google/gemini-2.0-flash-001"
  | "openai/gpt-4o"
  | "anthropic/claude-sonnet-4"

export const AI_MODELS: { id: AIModel; name: string; initial: string }[] = [
  { id: "openai/gpt-4o", name: "GPT-4o", initial: "O" },
  { id: "google/gemini-2.0-flash-001", name: "Gemini", initial: "G" },
  { id: "anthropic/claude-sonnet-4", name: "Claude", initial: "C" },
]

interface ComposerProps {
  onSend: (content: string, imageData?: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  selectedModel: AIModel
  onModelChange: (model: AIModel) => void
  /** Canvas-first shell puts the chat bar at the top */
  placement?: "top" | "bottom"
}

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  selectedModel,
  onModelChange,
  placement = "bottom",
}: ComposerProps) {
  const [value, setValue] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [showImageBounce, setShowImageBounce] = useState(false)
  const [hasAnimated, setHasAnimated] = useState(false)
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const baseTextRef = useRef("")
  const finalTranscriptsRef = useRef("")

  useEffect(() => {
    if (typeof window === "undefined") return

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    recognitionRef.current = new SpeechRecognitionCtor()
    recognitionRef.current.continuous = true
    recognitionRef.current.interimResults = true
    recognitionRef.current.lang = "en-US"

    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      let newFinalText = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          newFinalText += event.results[i][0].transcript + " "
        }
      }

      if (newFinalText) {
        finalTranscriptsRef.current += newFinalText
        setValue(baseTextRef.current + finalTranscriptsRef.current)
        setTimeout(() => handleInput(), 0)
      }
    }

    recognitionRef.current.onerror = () => {
      setIsRecording(false)
    }

    recognitionRef.current.onend = () => {
      setIsRecording(false)
    }

    return () => {
      recognitionRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setHasAnimated(true)
  }, [])

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in your browser")
      return
    }

    if (isRecording) {
      recognitionRef.current.stop()
      setIsRecording(false)
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop())
        setMediaStream(null)
      }
    } else {
      baseTextRef.current = value
      finalTranscriptsRef.current = ""
      recognitionRef.current.start()
      setIsRecording(true)

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => setMediaStream(stream))
        .catch(() => {})
    }
  }, [isRecording, value, mediaStream])

  const handleSend = useCallback(() => {
    if ((!value.trim() && !uploadedImage) || isStreaming || disabled) return

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
    }
    onSend(value || "Describe this image", uploadedImage || undefined)
    setValue("")
    setUploadedImage(null)
    baseTextRef.current = ""
    finalTranscriptsRef.current = ""
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, uploadedImage, isStreaming, disabled, onSend, isRecording])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader()
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string)
        setShowImageBounce(true)
        setTimeout(() => setShowImageBounce(false), 400)
      }
      reader.readAsDataURL(file)
    }
    e.target.value = ""
  }, [])

  const currentModel = AI_MODELS.find((m) => m.id === selectedModel) || AI_MODELS[0]

  return (
    <div
      className={cn(
        "pointer-events-none relative z-10 w-full px-4",
        hasAnimated && "composer-intro"
      )}
    >
      <div className="pointer-events-auto relative mx-auto max-w-2xl">
        <div
          className={cn(
            "relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-md transition-all duration-200",
            "focus-within:ring-2 focus-within:ring-ring/40"
          )}
        >
          <div className="flex items-center gap-2">
            {uploadedImage && (
              <div className={cn("relative shrink-0", showImageBounce && "image-bounce")}>
                <div className="h-12 w-12 overflow-hidden rounded-lg border border-border">
                  <Image
                    src={uploadedImage}
                    alt="Uploaded image"
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                  />
                </div>
                <button
                  onClick={() => setUploadedImage(null)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:opacity-90"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                handleInput()
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                isRecording
                  ? "Listening..."
                  : "Type a message... (Shift+Enter for new line)"
              }
              disabled={isStreaming || disabled}
              rows={1}
              className={cn(
                "max-h-[56px] flex-1 resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground",
                "focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              )}
              aria-label="Message input"
            />

            {isRecording && (
              <div className="w-24 shrink-0">
                <AudioWaveform isRecording={isRecording} stream={mediaStream} />
              </div>
            )}

            {isStreaming ? (
              <button
                onClick={onStop}
                className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all hover:scale-105"
                aria-label="Stop generating"
              >
                <AnimatedOrb size={36} variant="red" />
                <Square
                  className="absolute h-4 w-4 text-red-300 drop-shadow-md"
                  fill="currentColor"
                  aria-hidden="true"
                />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={(!value.trim() && !uploadedImage) || disabled}
                className={cn(
                  "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                  (!value.trim() && !uploadedImage) || disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer hover:scale-105"
                )}
                aria-label="Send message"
              >
                <AnimatedOrb size={36} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              aria-label="Upload image"
            />

            <Button
              onClick={toggleRecording}
              disabled={isStreaming || disabled}
              size="icon"
              className={cn(
                "relative z-10 h-9 w-9 shrink-0 rounded-full transition-all",
                isRecording
                  ? "animate-bounce-subtle bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-muted text-foreground hover:bg-accent"
              )}
              aria-label={isRecording ? "Stop recording" : "Start voice input"}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || disabled}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-muted text-foreground hover:bg-accent"
              aria-label="Attach image"
            >
              <Paperclip className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isStreaming || disabled}
                  className="h-9 w-9 shrink-0 rounded-full bg-muted text-foreground hover:bg-accent"
                  aria-label="Select AI model"
                >
                  <Brain className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuPortal>
                <DropdownMenuContent
                  align="start"
                  side={placement === "top" ? "bottom" : "top"}
                  sideOffset={8}
                  className="z-[9999] w-40 rounded-2xl border-border bg-card px-2 py-2"
                >
                  {AI_MODELS.map((model) => (
                    <DropdownMenuItem
                      key={model.id}
                      onClick={() => onModelChange(model.id)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg",
                        selectedModel === model.id && "bg-muted"
                      )}
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-border bg-background text-[10px] font-medium text-muted-foreground">
                        {model.initial}
                      </span>
                      <span className="text-sm">{model.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenuPortal>
            </DropdownMenu>

            <span className="text-xs text-muted-foreground">{currentModel.name}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
