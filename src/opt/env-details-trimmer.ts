import type { ApiMessage } from "../core/task-persistence/apiMessages"

/**
 * Strip <environment_details>...</environment_details> blocks from old conversation rounds.
 *
 * Every user message carries a fresh environment_details block (current time, open tabs,
 * terminal state, cost, mode, file tree, etc.). In a long conversation these accumulate
 * in the history and are re-sent to the API on every request, even though the model only
 * needs the LATEST one.
 *
 * This function replaces env blocks in old rounds with a compact placeholder, while
 * keeping the most recent `keepRecentRounds` rounds fully intact so the model has
 * accurate current context.
 *
 * Only the in-memory copy sent to the API is modified. The persisted
 * apiConversationHistory on disk is never touched.
 */
export function trimOldEnvironmentDetails(messages: ApiMessage[], opts?: { keepRecentRounds?: number }): ApiMessage[] {
	const keepRecentRounds = opts?.keepRecentRounds ?? 1

	// Find all user message indices (env_details live in user messages).
	const userIndices = messages.reduce<number[]>((acc, msg, idx) => {
		if (msg.role === "user") acc.push(idx)
		return acc
	}, [])

	// Keep the last `keepRecentRounds` user messages intact.
	if (userIndices.length <= keepRecentRounds) {
		return messages
	}

	const cutoffIndex = userIndices[userIndices.length - keepRecentRounds]

	return messages.map((msg, idx) => {
		if (idx >= cutoffIndex) return msg
		if (msg.role !== "user") return msg

		// Check if any content block is an environment_details text block.
		const content = msg.content
		if (!Array.isArray(content)) return msg

		const hasEnvBlock = content.some(
			(block) =>
				block.type === "text" &&
				typeof (block as { type: string; text?: string }).text === "string" &&
				isEnvDetailsBlock((block as { type: string; text: string }).text),
		)
		if (!hasEnvBlock) return msg

		const newContent = content.map((block) => {
			if (
				block.type === "text" &&
				typeof (block as { type: string; text?: string }).text === "string" &&
				isEnvDetailsBlock((block as { type: string; text: string }).text)
			) {
				return { type: "text" as const, text: "[environment_details omitted]" }
			}
			return block
		})

		return { ...msg, content: newContent }
	})
}

/**
 * Returns true if the text block is a standalone environment_details block.
 * Matches the same heuristic used in Task.ts to filter out old env blocks:
 * the trimmed text must start with <environment_details> and end with </environment_details>.
 */
function isEnvDetailsBlock(text: string): boolean {
	const trimmed = text.trim()
	return trimmed.startsWith("<environment_details>") && trimmed.endsWith("</environment_details>")
}
