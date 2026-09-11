"use client"

import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ImageIcon } from "lucide-react"
import type { ImageStyle } from "@/lib/schemas"

interface ImageOptionsProps {
  generateImages: boolean
  onGenerateImagesChange: (value: boolean) => void
  imageStyle: ImageStyle
  onImageStyleChange: (style: ImageStyle) => void
  brandColor: string
  onBrandColorChange: (color: string) => void
}

const IMAGE_STYLES: Array<{ id: ImageStyle; label: string }> = [
  { id: "minimal", label: "Minimal" },
  { id: "illustration", label: "Illustration" },
  { id: "product", label: "Product" },
  { id: "abstract", label: "Abstract" },
]

export function ImageOptions({
  generateImages,
  onGenerateImagesChange,
  imageStyle,
  onImageStyleChange,
  brandColor,
  onBrandColorChange,
}: ImageOptionsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="text-sm font-medium">Generate Images</div>
            <div className="text-xs text-muted-foreground">AI visuals per platform</div>
          </div>
        </div>
        <Switch
          checked={generateImages}
          onCheckedChange={onGenerateImagesChange}
        />
      </div>

      {generateImages && (
        <div className="space-y-4 rounded-md border border-border bg-muted p-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Style
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {IMAGE_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onImageStyleChange(style.id)}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-all ${
                    imageStyle === style.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card hover:border-muted-foreground/50"
                  }`}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="brandColor"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Brand Color (optional)
            </Label>
            <div className="flex gap-2">
              <Input
                id="brandColor"
                type="text"
                placeholder="#3B82F6"
                value={brandColor}
                onChange={(e) => onBrandColorChange(e.target.value)}
                className="flex-1 font-mono text-sm"
              />
              <div className="relative">
                <input
                  type="color"
                  value={brandColor || "#3B82F6"}
                  onChange={(e) => onBrandColorChange(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <div
                  className="h-10 w-10 rounded-md border"
                  style={{ backgroundColor: brandColor || "#3B82F6" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
