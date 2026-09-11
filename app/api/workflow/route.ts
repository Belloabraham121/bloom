import { NextRequest, NextResponse } from "next/server"
import { WorkflowInputSchema } from "@/lib/schemas"
import { runContentWorkflow } from "@/workflows/content-workflow"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validationResult = WorkflowInputSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.issues },
        { status: 400 }
      )
    }

    const input = validationResult.data

    // Run the workflow directly
    const result = await runContentWorkflow(input)

    return NextResponse.json({
      status: "completed",
      ...result,
    })
  } catch (error) {
    console.error("Workflow error:", error)
    return NextResponse.json(
      { error: "Workflow failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
