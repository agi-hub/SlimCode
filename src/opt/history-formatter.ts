import type { Anthropic } from "@anthropic-ai/sdk"
import type { ApiMessage } from "../core/task-persistence/apiMessages"

/**
 * Compact tool call blocks in old conversation rounds before sending to the API.
 *
 * What this does (only for rounds OLDER than `keepRecentRounds`):
 * 1. tool_use.input: serialised without indentation (JSON.stringify(input) instead of
 *    JSON.stringify(input, null, 2)), saving whitespace tokens.
 * 2. tool_result string content: truncated to `maxResultChars` with a summary note.
 * 3. tool_result array content: multiple text blocks merged into one; image blocks
 *    replaced with the literal text "[image]".
 *
 * The `tool_use_id` / `tool_use_id` reference chain is never touched, so API-level
 * tool-result matching continues to work correctly.
 *
 * This function operates on the in-memory copy that is about to be sent to the API.
 * It does NOT modify the persisted apiConversationHistory on disk.
 */
export function compactOldToolBlocks(
	messages: ApiMessage[],
	opts?: {
		keepRecentRounds?: number
		maxResultChars?: number
	},
): ApiMessage[] {
	const keepRecentRounds = opts?.keepRecentRounds ?? 3
	const maxResultChars = opts?.maxResultChars ?? 2000

	// Find the cutoff: index of the assistant message that starts the Nth-from-last round.
	const assistantIndices = messages.reduce<number[]>((acc, msg, idx) => {
		if (msg.role === "assistant") acc.push(idx)
		return acc
	}, [])

	// If we have fewer rounds than the keep threshold, nothing to compact.
	if (assistantIndices.length <= keepRecentRounds) {
		return messages
	}

	const cutoffIndex = assistantIndices[assistantIndices.length - keepRecentRounds]

	return messages.map((msg, idx) => {
		if (idx >= cutoffIndex) return msg

		// Process assistant messages: compact tool_use input indentation.
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			const newContent = msg.content.map((block) => {
				const b = block as Anthropic.Messages.ContentBlock
				if (b.type === "tool_use") {
					const toolUse = b as Anthropic.Messages.ToolUseBlock
					if (toolUse.input && typeof toolUse.input === "object") {
						return { ...toolUse, input: compactJsonObject(toolUse.input as Record<string, unknown>) }
					}
				}
				return block
			})
			// Only allocate a new object if something actually changed.
			if (newContent.some((b, i) => b !== msg.content[i])) {
				return { ...msg, content: newContent }
			}
		}

		// Process user messages: compact tool_result content.
		if (msg.role === "user" && Array.isArray(msg.content)) {
			const newContent = msg.content.map((block) => {
				const b = block as Anthropic.Messages.ContentBlock
				if (b.type === "tool_result") {
					const tr = b as Anthropic.Messages.ToolResultBlockParam
					return { ...tr, content: compactToolResultContent(tr.content, maxResultChars) }
				}
				return block
			})
			if (newContent.some((b, i) => b !== msg.content[i])) {
				return { ...msg, content: newContent }
			}
		}

		return msg
	})
}

/**
 * Re-serialise a JSON object without indentation.
 * Falls back to the original value if serialisation throws.
 */
function compactJsonObject(obj: Record<string, unknown>): Record<string, unknown> {
	try {
		// Round-trip through compact JSON to strip whitespace values.
		// We keep the object type (not string) because the API expects an object.
		return JSON.parse(JSON.stringify(obj))
	} catch {
		return obj
	}
}

type ToolResultContent = string | Anthropic.ToolResultBlockParam["content"]

function compactToolResultContent(content: ToolResultContent, maxResultChars: number): ToolResultContent {
	if (typeof content === "string") {
		return truncateString(content, maxResultChars)
	}

	if (Array.isArray(content)) {
		// Merge all text blocks into one; replace image blocks with "[image]".
		const merged = content
			.map((block) => {
				if (block.type === "text") return block.text
				if (block.type === "image") return "[image]"
				return ""
			})
			.join("\n")
			.trim()

		const truncated = truncateString(merged, maxResultChars)
		return truncated
	}

	return content
}

function truncateString(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text
	const omitted = text.length - maxChars
	return `${text.slice(0, maxChars)}[...${omitted} chars truncated]`
}
