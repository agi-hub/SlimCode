// npx vitest src/opt/__tests__/reasoning-history-trimmer.spec.ts

import { describe, it, expect } from "vitest"
import { trimReasoningHistory } from "../reasoning-history-trimmer"
import type { ApiMessage } from "../../core/task-persistence/apiMessages"

// ─── helpers ────────────────────────────────────────────────────────────────

function assistantMsg(extra: Partial<ApiMessage> = {}): ApiMessage {
	return { role: "assistant", content: [{ type: "text", text: "reply" }], ...extra }
}
function userMsg(): ApiMessage {
	return { role: "user", content: [{ type: "text", text: "hi" }] }
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("trimReasoningHistory", () => {
	// ─── Anthropic: 绝不修改 ────────────────────────────────────────────
	describe("Anthropic provider – never modified", () => {
		it("returns the original array reference unchanged for anthropic", () => {
			const msgs: ApiMessage[] = [
				userMsg(),
				assistantMsg({ reasoning_content: "thinking..." }),
				userMsg(),
			]
			const result = trimReasoningHistory(msgs, "anthropic")
			expect(result).toBe(msgs)
		})

		it("returns unchanged for anthropic-vertex", () => {
			const msgs: ApiMessage[] = [userMsg(), assistantMsg({ reasoning_content: "thinking" })]
			expect(trimReasoningHistory(msgs, "anthropic-vertex")).toBe(msgs)
		})
	})

	// ─── 无 reasoning 字段: 快速返回 ────────────────────────────────────
	describe("no reasoning fields – fast path", () => {
		it("returns the same array when no reasoning fields exist", () => {
			const msgs: ApiMessage[] = [userMsg(), assistantMsg(), userMsg()]
			const result = trimReasoningHistory(msgs, "deepseek")
			expect(result).toBe(msgs)
		})
	})

	// ─── OpenAI encrypted_content: 不修改 ───────────────────────────────
	describe("OpenAI encrypted_content – never touched", () => {
		it("keeps encrypted_content intact regardless of round position", () => {
			const msgs: ApiMessage[] = [
				userMsg(),
				assistantMsg({ encrypted_content: "enc==", reasoning_content: "thinking" }),
				userMsg(),
				assistantMsg({ encrypted_content: "enc2==" }),
				userMsg(),
			]
			const result = trimReasoningHistory(msgs, "openai", { keepRecentRounds: 1 })
			// All assistant messages with encrypted_content must be preserved
			const withEnc = result.filter((m) => (m as any).encrypted_content !== undefined)
			expect(withEnc).toHaveLength(2)
		})
	})

	// ─── DeepSeek: reasoning_content 旧轮次置空 ─────────────────────────
	describe("DeepSeek – reasoning_content cleared in old rounds", () => {
		it("clears reasoning_content in rounds older than keepRecentRounds=1", () => {
			const msgs: ApiMessage[] = [
				userMsg(),
				assistantMsg({ reasoning_content: "old thinking" }),   // round 1 (old)
				userMsg(),
				assistantMsg({ reasoning_content: "recent thinking" }), // round 2 (kept)
				userMsg(),
			]
			const result = trimReasoningHistory(msgs, "deepseek", { keepRecentRounds: 1 })

			const [, oldAssistant, , recentAssistant] = result
			expect((oldAssistant as ApiMessage).reasoning_content).toBe("")
			expect((recentAssistant as ApiMessage).reasoning_content).toBe("recent thinking")
		})

		it("keeps all rounds when total rounds <= keepRecentRounds", () => {
			const msgs: ApiMessage[] = [
				userMsg(),
				assistantMsg({ reasoning_content: "thinking" }),
				userMsg(),
			]
			const result = trimReasoningHistory(msgs, "deepseek", { keepRecentRounds: 3 })
			expect((result[1] as ApiMessage).reasoning_content).toBe("thinking")
		})
	})

	// ─── Gemini via OpenRouter: reasoning_details 旧轮次清空 ─────────────
	describe("OpenRouter/Gemini – reasoning_details cleared in old rounds", () => {
		it("clears reasoning_details array in old rounds", () => {
			const msgs: ApiMessage[] = [
				userMsg(),
				assistantMsg({ reasoning_details: [{ type: "thinking", thinking: "..." }] }), // old
				userMsg(),
				assistantMsg({ reasoning_details: [{ type: "thinking", thinking: "fresh" }] }), // kept
				userMsg(),
			]
			const result = trimReasoningHistory(msgs, "openrouter", { keepRecentRounds: 1 })

			expect((result[1] as ApiMessage).reasoning_details).toEqual([])
			expect((result[3] as ApiMessage).reasoning_details).toEqual([{ type: "thinking", thinking: "fresh" }])
		})
	})

	// ─── 独立 type:"reasoning" 消息 (明文 text) 被移除 ──────────────────
	describe("standalone type:reasoning messages removed from old rounds", () => {
		it("removes plain-text reasoning messages from old rounds", () => {
			const reasoningMsg: ApiMessage = { type: "reasoning", text: "plain thinking", role: "assistant", content: [] }
			const msgs: ApiMessage[] = [
				userMsg(),
				reasoningMsg,                         // old round reasoning message
				assistantMsg(),                       // old round reply
				userMsg(),
				assistantMsg({ reasoning_content: "new" }), // recent
				userMsg(),
			]
			const before = msgs.length
			const result = trimReasoningHistory(msgs, "deepseek", { keepRecentRounds: 1 })

			// The standalone reasoning msg should be removed
			expect(result.length).toBeLessThan(before)
			expect(result.find((m) => (m as any).text === "plain thinking")).toBeUndefined()
		})

		it("does NOT remove a type:reasoning message that has encrypted_content", () => {
			const encReasoning: ApiMessage = {
				type: "reasoning",
				encrypted_content: "enc==",
				role: "assistant",
				content: [],
			}
			const msgs: ApiMessage[] = [userMsg(), encReasoning, userMsg(), assistantMsg(), userMsg()]
			const result = trimReasoningHistory(msgs, "openai", { keepRecentRounds: 1 })
			expect(result.find((m) => (m as any).encrypted_content === "enc==")).toBeDefined()
		})
	})

	// ─── 不修改原数组 ────────────────────────────────────────────────────
	describe("immutability", () => {
		it("does not mutate the original messages array", () => {
			const msgs: ApiMessage[] = [
				userMsg(),
				assistantMsg({ reasoning_content: "thinking" }),
				userMsg(),
				assistantMsg({ reasoning_content: "more" }),
				userMsg(),
			]
			const original = JSON.stringify(msgs)
			trimReasoningHistory(msgs, "deepseek", { keepRecentRounds: 1 })
			expect(JSON.stringify(msgs)).toBe(original)
		})
	})
})
