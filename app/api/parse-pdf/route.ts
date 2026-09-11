import { NextRequest, NextResponse } from "next/server"
import { extractText } from "unpdf"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const result = await extractText(new Uint8Array(arrayBuffer))
    
    // extractText returns text as an array of strings (one per page)
    const textContent = Array.isArray(result.text) 
      ? result.text.join(" ") 
      : String(result.text || "")

    const cleanedText = textContent
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000)

    return NextResponse.json({
      text: cleanedText,
      pages: result.totalPages,
      filename: file.name,
    })
  } catch (error) {
    console.error("PDF parsing error:", error)
    return NextResponse.json(
      { error: "Failed to parse PDF" },
      { status: 500 }
    )
  }
}
