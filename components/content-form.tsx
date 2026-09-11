"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Plus, X, Link2, FileText, Upload, Loader2, Mic, MicOff } from "lucide-react"
import type { ContentSource } from "@/lib/schemas"

interface ContentFormProps {
  sources: ContentSource[]
  onSourcesChange: (sources: ContentSource[]) => void
}

export function ContentForm({ sources, onSourcesChange }: ContentFormProps) {
  const [inputType, setInputType] = useState<"url" | "text" | "pdf">("url")
  const [urlInput, setUrlInput] = useState("")
  const [textInput, setTextInput] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isListening, setIsListening] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const startListening = () => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      setUploadError("Speech recognition is not supported in this browser")
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onresult = (event) => {
      let finalTranscript = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript
        }
      }
      if (finalTranscript) {
        setTextInput((prev) => prev + (prev ? " " : "") + finalTranscript)
      }
    }

    recognition.onerror = (event) => {
      setIsListening(false)
      if (event.error !== "aborted") {
        setUploadError(`Speech recognition error: ${event.error}`)
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setUploadError(null)
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }

  const isValidUrl = (string: string): boolean => {
    try {
      const url = new URL(string)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }

  // Auto-add valid URLs or show error after a short delay
  useEffect(() => {
    if (inputType !== "url" || !urlInput.trim()) {
      setUrlError(null)
      return
    }
    
    const trimmedUrl = urlInput.trim()
    
    if (isValidUrl(trimmedUrl)) {
      // Valid URL - auto-add after delay
      const timer = setTimeout(() => {
        onSourcesChange([...sources, { type: "url", value: trimmedUrl }])
        setUrlInput("")
        setUrlError(null)
      }, 500)
      return () => clearTimeout(timer)
    } else {
      // Invalid URL - show error after user stops typing
      const errorTimer = setTimeout(() => {
        setUrlError("Please enter a valid URL (e.g., https://example.com)")
      }, 800)
      return () => clearTimeout(errorTimer)
    }
  }, [urlInput, inputType, sources, onSourcesChange])

  const addSource = () => {
    if (inputType === "url" && urlInput.trim()) {
      if (!isValidUrl(urlInput.trim())) {
        setUrlError("Please enter a valid URL (e.g., https://example.com)")
        return
      }
      setUrlError(null)
      onSourcesChange([...sources, { type: "url", value: urlInput.trim() }])
      setUrlInput("")
    } else if (inputType === "text" && textInput.trim()) {
      onSourcesChange([...sources, { type: "text", value: textInput.trim() }])
      setTextInput("")
    }
  }

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== "application/pdf") {
      setUploadError("Please select a PDF file")
      return
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to parse PDF")
      }

      const data = await response.json()

      // Add as source with extracted text and metadata
      onSourcesChange([...sources, { 
        type: "pdf", 
        value: data.text,
        metadata: {
          filename: data.filename,
          pages: data.pages,
        }
      }])
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Failed to upload PDF")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const removeSource = (index: number) => {
    onSourcesChange(sources.filter((_, i) => i !== index))
  }

  const getPdfDisplayName = (source: ContentSource) => {
    if (source.type !== "pdf") return ""
    if (source.metadata) {
      return `${source.metadata.filename} (${source.metadata.pages} page${source.metadata.pages > 1 ? "s" : ""})`
    }
    return `PDF (${source.value.length.toLocaleString()} chars)`
  }

  const getSourceIcon = (type: ContentSource["type"]) => {
    switch (type) {
      case "url":
        return <Link2 className="h-3 w-3 text-muted-foreground" />
      case "pdf":
        return <Upload className="h-3 w-3 text-muted-foreground" />
      default:
        return <FileText className="h-3 w-3 text-muted-foreground" />
    }
  }

  const getSourceDisplay = (source: ContentSource) => {
    switch (source.type) {
      case "url":
        return source.value
      case "pdf":
        return getPdfDisplayName(source)
      default:
        return source.value.length > 80 ? `${source.value.slice(0, 80)}...` : source.value
    }
  }

  return (
    <div className="space-y-4">
      {/* Input type toggle */}
      <div className="inline-flex rounded-md border border-border bg-muted p-1">
        <button
          type="button"
          onClick={() => setInputType("url")}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            inputType === "url"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" />
          URL
        </button>
        <button
          type="button"
          onClick={() => setInputType("text")}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            inputType === "text"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          Text
        </button>
        <button
          type="button"
          onClick={() => setInputType("pdf")}
          className={`flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
            inputType === "pdf"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          PDF
        </button>
      </div>

      {/* Input fields */}
      {inputType === "url" ? (
        <div className="space-y-2">
          <Input
            type="url"
            placeholder="Paste or type a URL..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className={urlError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {urlInput.trim() && isValidUrl(urlInput.trim()) && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Adding...
            </p>
          )}
          {urlError && (
            <p className="text-sm text-destructive">{urlError}</p>
          )}
        </div>
) : inputType === "text" ? (
  <div className="space-y-3">
  <div className="relative">
  <Textarea
  placeholder="Paste your content here or use the microphone..."
  value={textInput}
  onChange={(e) => setTextInput(e.target.value)}
  rows={6}
  className="resize-none pr-12"
  />
  <Button
  type="button"
  variant="ghost"
  size="icon"
  onClick={isListening ? stopListening : startListening}
  className={`absolute right-2 top-2 h-8 w-8 ${
  isListening 
    ? "text-destructive hover:text-destructive/80" 
    : "text-muted-foreground hover:text-foreground"
  }`}
  title={isListening ? "Stop recording" : "Start voice input"}
  >
  {isListening ? (
  <span className="relative flex h-4 w-4">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
    <MicOff className="relative h-4 w-4" />
  </span>
  ) : (
  <Mic className="h-4 w-4" />
  )}
  </Button>
  </div>
  <div className="flex items-center gap-2">
  <Button
  type="button"
  onClick={addSource}
  variant="outline"
  disabled={!textInput.trim()}
  className="gap-2 bg-transparent"
  >
  <Plus className="h-4 w-4" />
  Add Content
  </Button>
  {isListening && (
  <span className="text-sm text-muted-foreground animate-pulse">
    Listening...
  </span>
  )}
  </div>
  </div>
  ) : (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handlePdfUpload}
            className="hidden"
            id="pdf-upload"
          />
          <label
            htmlFor="pdf-upload"
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:border-foreground/30 hover:bg-muted/50 ${
              isUploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {isUploading ? (
              <>
                <Loader2 className="mb-3 h-8 w-8 animate-spin text-muted-foreground" />
                <span className="text-sm font-medium">Processing PDF...</span>
              </>
            ) : (
              <>
                <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">Click to upload PDF</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  or drag and drop
                </span>
              </>
            )}
          </label>
          {uploadError && (
            <p className="text-sm text-destructive">{uploadError}</p>
          )}
        </div>
      )}

      {/* Added sources list */}
      {sources.length > 0 && (
        <div className="space-y-2 pt-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Added ({sources.length})
          </span>
          <div className="space-y-2">
            {sources.map((source, index) => (
              <div
                key={index}
                className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-accent">
                  {getSourceIcon(source.type)}
                </div>
                <span className="flex-1 truncate text-sm">
                  {getSourceDisplay(source)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => removeSource(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
