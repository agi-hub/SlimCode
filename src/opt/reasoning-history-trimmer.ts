import type { ApiMessage } from "../core/task-persistence/apiMessages"

/**
 * Strips old reasoning/thinking content from conversation history before sending to the API.
 *
 * Rationale:
 * - Anthropic Claude: thinking blocks carry a cryptographic `signature` field.
 *   The API validates this signature, so they MUST be kept intact.
 * - OpenAI o1/o3 (and compatible): reasoning is returned as `encrypted_content`.
 *   These also require intact round-tripping and must not be modified.
 * - All other providers (DeepSeek, Qwen via OpenAI-compat, Gemini via OpenRouter, etc.):
 *   reasoning is stored as plain text in `reasoning_content` (string) or
 *   `reasoning_details` (array). These have no integrity requirement and can be
 *   safely removed from older rounds to save tokens.
 *
 * Only the in-memory copy sent to the API is modified; the persisted
 * apiConversationHistory on disk is never touched.
 */
export function trimReasoningHistory(
	messages: ApiMessage[],
	provider: string,
	opts?: { keepRecentRounds?: number },
): ApiMessage[] {
	const keepRecentRounds = opts?.keepRecentRounds ?? 1

	// Anthropic: never touch – signature is cryptographically validated by the API.
	if (provider === "anthropic" || provider === "anthropic-vertex") {
		return messages
	}

	// If none of the messages have any reasoning fields, skip processing entirely.
	const hasAnyReasoning = messages.some(
		(m) =>
			m.reasoning_content !== undefined ||
			m.reasoning_details !== undefined ||
			(m.type === "reasoning" && m.encrypted_content === undefined),
	)
	if (!hasAnyReasoning) {
		return messages
	}

	// Identify assistant message indices (each assistant message = one "round").
	const assistantIndices = messages.reduce<number[]>((acc, msg, idx) => {
		if (msg.role === "assistant" || msg.type === "reasoning") {
			acc.push(idx)
		}
		return acc
	}, [])

	// Messages in the last `keepRecentRounds` assistant entries are kept intact.
	const cutoffIndex =
		assistantIndices.length > keepRecentRounds
			? assistantIndices[assistantIndices.length - keepRecentRounds]
			: 0

	return messages.map((msg, idx) => {
		// Keep recent rounds untouched.
		if (idx >= cutoffIndex) return msg

		// Independent reasoning message (DeepSeek-style "type: reasoning" entry
		// with plain text field – distinct from Anthropic which has encrypted_content).
		if (msg.type === "reasoning" && msg.encrypted_content === undefined) {
			// Drop the whole message by replacing with a sentinel-free stub.
			// Returning null would break array length; returning an empty user text
			// would confuse role alternation. We instead return a tiny placeholder
			// that keeps the role chain valid but wastes zero tokens in practice.
			// The placeholder is filtered out below.
			return null as unknown as ApiMessage
		}

		// Assistant messages that carry reasoning fields in their metadata.
		if (msg.role === "assistant") {
			// OpenAI encrypted_content – integrity-protected, must not touch.
			if (msg.encrypted_content !== undefined) return msg

			let changed = false
			const patched: ApiMessage = { ...msg }

			if (patched.reasoning_content !== undefined && patched.reasoning_content !== "") {
				patched.reasoning_content = ""
				changed = true
			}

			if (Array.isArray(patched.reasoning_details) && patched.reasoning_details.length > 0) {
				patched.reasoning_details = []
				changed = true
			}

			return changed ? patched : msg
		}

		return msg
	}).filter(Boolean) as ApiMessage[]
}
