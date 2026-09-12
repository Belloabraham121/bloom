import OpenAI from "openai"
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions"
import { generateSystemPrompt } from "@openuidev/lang-core"
import { TRADING_AGENT_INSTRUCTIONS } from "@/server/prompts/trading-agent"
import { createTradingToolHandlers } from "@/server/services/agent/tools"
import type { AgentMode } from "@/lib/types"
import {
  bloomLibrarySpec,
  bloomPromptOptions,
} from "@/lib/openui/bloom-spec"

export type ChatTurnInput = {
  userId: string
  decisionOrigin: AgentMode
  conversationId?: string | null
  model: string
  messages: Array<{
    role: "user" | "assistant"
    content: string
    imageData?: string
  }>
}

const MAX_TOOL_ROUNDS = 6
/** Keep request under model context limits (Claude is stricter via Thesys). */
const MAX_HISTORY_MESSAGES = 12
const MAX_MESSAGE_CHARS = 3500
const MAX_TOOL_RESULT_CHARS = 6000

function getThesysClient() {
  const apiKey = process.env.THESYS_API_KEY
  if (!apiKey) {
    throw new Error("THESYS_API_KEY is not configured")
  }
  return new OpenAI({
    apiKey,
    baseURL: "https://api.thesys.dev/v1/embed",
  })
}

/**
 * Thesys Embed requires `{provider}/{model}` (e.g. openai/gpt-4o).
 * See https://www.openui.com/docs/gateway/api/chat-completions
 */
function resolveModelId(model: string) {
  const raw = (model || "openai/gpt-4o").trim()
  if (raw.includes("/")) return raw
  return `openai/${raw}`
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…[truncated]`
}

/** Compact schemas — full Zod JSON Schema for every tool blows Claude's input limit. */
const COMPACT_OBJECT_PARAMS = {
  type: "object",
  additionalProperties: true,
  properties: {},
} as const

function buildOpenAITools(
  handlers: ReturnType<typeof createTradingToolHandlers>
): ChatCompletionTool[] {
  return Object.entries(handlers).map(([name, handler]) => ({
    type: "function" as const,
    function: {
      name,
      description: handler.description,
      parameters: { ...COMPACT_OBJECT_PARAMS },
    },
  }))
}

function looksLikeGreetingOnly(messages: ChatTurnInput["messages"]) {
  const last = [...messages].reverse().find((m) => m.role === "user")
  if (!last) return false
  const t = last.content.trim().toLowerCase()
  return /^(hi|hello|hey|yo|sup|thanks|thank you|ok|okay)\b[!.?]*$/i.test(t)
}

function toOpenAIMessages(
  input: ChatTurnInput,
  system: string
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
  ]

  const history = input.messages.slice(-MAX_HISTORY_MESSAGES)

  for (const m of history) {
    if (m.role === "user" && m.imageData) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: truncate(m.content || "Describe this image", MAX_MESSAGE_CHARS),
          },
          { type: "image_url", image_url: { url: m.imageData } },
        ],
      })
      continue
    }
    messages.push({
      role: m.role,
      content: truncate(m.content, MAX_MESSAGE_CHARS),
    })
  }

  return messages
}

function formatUpstreamError(error: unknown): string {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status: number }).status)
      : undefined
  const message =
    error instanceof Error ? error.message : "Chat stream failed"

  if (status === 402) {
    return "Model provider returned Payment Required (402). Check your Thesys/model billing, or switch to openai/gpt-4o."
  }
  if (status === 401) {
    return "Invalid THESYS_API_KEY (401)."
  }
  if (/input is too long/i.test(message)) {
    return "Error: Input is too long for this model. Start a new chat, switch to GPT-4o, or ask a shorter question."
  }
  return `Error: ${message}`
}

/**
 * Thesys Embed Chat Completions via the official OpenAI SDK.
 * Final OpenUI Lang is streamed token-by-token; tool rounds stay buffered.
 */
export async function runChatTurnAsResponse(
  input: ChatTurnInput
): Promise<Response> {
  const client = getThesysClient()
  const modelId = resolveModelId(input.model || "openai/gpt-4o")
  console.log("[chat] thesys model", modelId)

  const system = generateSystemPrompt({
    cloud: true,
    library: bloomLibrarySpec,
    instructions: TRADING_AGENT_INSTRUCTIONS,
    promptOptions: bloomPromptOptions,
  })

  const handlers = createTradingToolHandlers({
    userId: input.userId,
    decisionOrigin: input.decisionOrigin,
    conversationId: input.conversationId,
  })
  const tools = buildOpenAITools(handlers)
  const messages = toOpenAIMessages(input, system)
  const skipTools = looksLikeGreetingOnly(input.messages)

  const encoder = new TextEncoder()
  let produced = ""
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false

      const enqueue = (text: string) => {
        if (!text || closed || cancelled) return
        try {
          produced += text
          controller.enqueue(encoder.encode(text))
        } catch {
          closed = true
        }
      }

      const close = () => {
        if (closed) return
        closed = true
        try {
          controller.close()
        } catch {
          // already closed/cancelled
        }
      }

      const stopped = () => closed || cancelled

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          if (stopped()) return

          const completion = await client.chat.completions.create({
            model: modelId,
            messages,
            ...(skipTools
              ? {}
              : { tools, tool_choice: "auto" as const }),
            stream: true,
          })

          let content = ""
          let finishReason: string | null | undefined
          const toolCallBuilders = new Map<
            number,
            {
              id: string
              type: "function"
              function: { name: string; arguments: string }
            }
          >()

          for await (const chunk of completion) {
            if (stopped()) return

            const choice = chunk.choices[0]
            if (!choice) continue
            finishReason = choice.finish_reason ?? finishReason
            const delta = choice.delta

            if (delta?.tool_calls?.length) {
              for (const part of delta.tool_calls) {
                const index = part.index ?? 0
                const existing = toolCallBuilders.get(index)
                if (!existing) {
                  toolCallBuilders.set(index, {
                    id: part.id || `tool_${index}`,
                    type: "function",
                    function: {
                      name: part.function?.name || "",
                      arguments: part.function?.arguments || "",
                    },
                  })
                } else {
                  if (part.id) existing.id = part.id
                  if (part.function?.name) {
                    existing.function.name += part.function.name
                  }
                  if (part.function?.arguments) {
                    existing.function.arguments += part.function.arguments
                  }
                }
              }
              continue
            }

            const piece = delta?.content
            if (piece) {
              content += piece
              // Stream OpenUI Lang live when this chunk is not a tool-call turn.
              if (toolCallBuilders.size === 0) {
                enqueue(piece)
              }
            }
          }

          if (stopped()) return

          const toolCalls = [...toolCallBuilders.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, call]) => call)
            .filter((call) => call.function.name)

          if (toolCalls.length > 0) {
            messages.push({
              role: "assistant",
              content: content || null,
              tool_calls: toolCalls,
            })

            for (const call of toolCalls) {
              const name = call.function.name
              const handler = handlers[name]
              let args: unknown = {}
              try {
                args = call.function.arguments
                  ? JSON.parse(call.function.arguments)
                  : {}
              } catch {
                args = { raw: call.function.arguments }
              }

              let result: unknown
              try {
                if (!handler) {
                  result = { error: `Unknown tool: ${name}` }
                } else {
                  result = await handler.execute(args)
                }
              } catch (err) {
                result = {
                  error: err instanceof Error ? err.message : "Tool failed",
                }
              }

              messages.push({
                role: "tool",
                tool_call_id: call.id,
                content: truncate(
                  JSON.stringify(result),
                  MAX_TOOL_RESULT_CHARS
                ),
              })
            }
            continue
          }

          if (!content.trim()) {
            console.warn("[chat] Thesys returned empty content", {
              finishReason,
              model: modelId,
            })
            if (!produced.trim()) {
              enqueue(
                "No reply text was returned from the model. Please try again."
              )
            }
          }
          close()
          return
        }

        enqueue(
          "I hit the tool-call limit before finishing. Please try a simpler request."
        )
        close()
      } catch (error) {
        if (stopped()) return
        console.error("[chat] Thesys chat error:", error)
        const detail = formatUpstreamError(error)
        if (!produced.trim()) enqueue(detail)
        else enqueue(`\n\n${detail}`)
        close()
      }
    },
    cancel() {
      cancelled = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Bloom-Chat": "thesys-openai-sdk-stream",
    },
  })
}
