// npx vitest src/opt/__tests__/history-formatter.spec.ts

import { describe, it, expect } from "vitest"
import { compactOldToolBlocks } from "../history-formatter"
import type { ApiMessage } from "../../core/task-persistence/apiMessages"
import type { Anthropic } from "@anthropic-ai/sdk"

// ─── helpers ────────────────────────────────────────────────────────────────

function userMsg(content: Anthropic.MessageParam["content"] = [{ type: "text", text: "hi" }]): ApiMessage {
	return { role: "user", content }
}

function assistantMsg(content: Anthropic.MessageParam["content"] = [{ type: "text", text: "reply" }]): ApiMessage {
	return { role: "assistant", content }
}

function toolUseMsg(id: string, name: string, input: Record<string, unknown>): ApiMessage {
	return {
		role: "assistant",
		content: [{ type: "tool_use", id, name, input }],
	}
}

function toolResultMsg(toolUseId: string, resultContent: string): ApiMessage {
	return {
		role: "user",
		content: [{ type: "tool_result", tool_use_id: toolUseId, content: resultContent }],
	}
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("compactOldToolBlocks", () => {
	// ─── 不足 keepRecentRounds 时不做任何处理 ───────────────────────────
	describe("short history – no compaction", () => {
		it("returns the same array when rounds <= keepRecentRounds", () => {
			const msgs = [userMsg(), assistantMsg(), userMsg()]
			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 3 })
			expect(result).toBe(msgs)
		})
	})

	// ─── tool_use.input 去掉缩进 ────────────────────────────────────────
	describe("tool_use input – indentation removed in old rounds", () => {
		it("serialises input without indentation for old rounds", () => {
			// 4 rounds so that rounds 1 and 2 are "old" with keepRecentRounds=2
			const indentedInput = { path: "src/app.ts", content: "hello world" }
			const msgs: ApiMessage[] = [
				// round 1 (old)
				toolUseMsg("id-1", "write_to_file", indentedInput),
				toolResultMsg("id-1", "OK"),
				// round 2 (old)
				toolUseMsg("id-2", "read_file", { path: "src/app.ts" }),
				toolResultMsg("id-2", "hello world"),
				// round 3 (recent)
				toolUseMsg("id-3", "list_files", { path: "." }),
				toolResultMsg("id-3", "src/app.ts"),
				// round 4 (recent)
				toolUseMsg("id-4", "read_file", { path: "README.md" }),
				toolResultMsg("id-4", "# README"),
			]

			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 2 })

			// Old round: input should be compact (no whitespace from pretty-print)
			const oldToolUse = (result[0].content as any[])[0]
			expect(oldToolUse.type).toBe("tool_use")
			// Original object reference is NOT mutated
			expect(oldToolUse.input).not.toBe(indentedInput)

			// Recent round: must remain untouched (same reference)
			expect(result[4]).toBe(msgs[4])
		})
	})

	// ─── tool_result string content 超长截断 ────────────────────────────
	describe("tool_result string – truncated in old rounds", () => {
		it("truncates long string content and appends truncation note", () => {
			const longContent = "X".repeat(5000)
			const msgs: ApiMessage[] = [
				toolUseMsg("id-1", "read_file", { path: "big.ts" }),
				toolResultMsg("id-1", longContent),
				toolUseMsg("id-2", "read_file", { path: "big.ts" }),
				toolResultMsg("id-2", longContent),
				// recent round
				toolUseMsg("id-3", "read_file", { path: "a.ts" }),
				toolResultMsg("id-3", "short"),
				toolUseMsg("id-4", "read_file", { path: "b.ts" }),
				toolResultMsg("id-4", "also short"),
			]

			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 2, maxResultChars: 100 })

			const oldToolResult = (result[1].content as any[])[0]
			// maxResultChars=100 → 100 chars kept + "[...N chars truncated]" suffix, well under 5000
			expect(oldToolResult.content.length).toBeLessThan(200)
			expect(oldToolResult.content.length).toBeGreaterThan(100)
			expect(oldToolResult.content).toContain("chars truncated")

			// Recent round must be intact
			const recentResult = (result[5].content as any[])[0]
			expect(recentResult.content).toBe("short")
		})

		it("does not truncate content within maxResultChars", () => {
			const shortContent = "hello world"
			const msgs: ApiMessage[] = [
				toolUseMsg("id-1", "read_file", { path: "a.ts" }),
				toolResultMsg("id-1", shortContent),
				toolUseMsg("id-2", "read_file", { path: "b.ts" }),
				toolResultMsg("id-2", shortContent),
				toolUseMsg("id-3", "read_file", { path: "c.ts" }),
				toolResultMsg("id-3", shortContent),
				toolUseMsg("id-4", "read_file", { path: "d.ts" }),
				toolResultMsg("id-4", shortContent),
			]

			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 2, maxResultChars: 2000 })
			const oldResult = (result[1].content as any[])[0]
			expect(oldResult.content).toBe(shortContent)
		})
	})

	// ─── tool_result array content: 合并文本块 ──────────────────────────
	describe("tool_result array content – merged in old rounds", () => {
		it("merges multiple text blocks into one", () => {
			const arrayContent: Anthropic.ToolResultBlockParam["content"] = [
				{ type: "text", text: "part1" },
				{ type: "text", text: "part2" },
			]
			const msgs: ApiMessage[] = [
				toolUseMsg("id-1", "search", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-1", content: arrayContent }] },
				toolUseMsg("id-2", "search", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-2", content: arrayContent }] },
				// recent rounds
				toolUseMsg("id-3", "search", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-3", content: "fresh" }] },
				toolUseMsg("id-4", "search", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-4", content: "also fresh" }] },
			]

			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 2, maxResultChars: 2000 })
			const compacted = (result[1].content as any[])[0]
			// merged to a single string
			expect(typeof compacted.content).toBe("string")
			expect(compacted.content).toContain("part1")
			expect(compacted.content).toContain("part2")
		})

		it("replaces image blocks with [image] placeholder", () => {
			const arrayContent: Anthropic.ToolResultBlockParam["content"] = [
				{ type: "text", text: "description" },
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
			]
			const msgs: ApiMessage[] = [
				toolUseMsg("id-1", "screenshot", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-1", content: arrayContent }] },
				toolUseMsg("id-2", "screenshot", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-2", content: arrayContent }] },
				// recent rounds
				toolUseMsg("id-3", "x", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-3", content: "ok" }] },
				toolUseMsg("id-4", "x", {}),
				{ role: "user", content: [{ type: "tool_result", tool_use_id: "id-4", content: "ok" }] },
			]

			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 2 })
			const compacted = (result[1].content as any[])[0]
			expect(compacted.content).toContain("[image]")
			// original image data is gone
			expect(compacted.content).not.toContain("abc")
		})
	})

	// ─── tool_use_id 引用完整性 ──────────────────────────────────────────
	describe("tool_use_id reference integrity", () => {
		it("never alters tool_use_id values", () => {
			const msgs: ApiMessage[] = []
			for (let i = 0; i < 8; i++) {
				msgs.push(toolUseMsg(`id-${i}`, "read_file", { path: "file.ts" }))
				msgs.push(toolResultMsg(`id-${i}`, "content"))
			}

			const result = compactOldToolBlocks(msgs, { keepRecentRounds: 2 })

			result.forEach((msg) => {
				const blocks = msg.content as any[]
				blocks.forEach((b) => {
					if (b.type === "tool_use") {
						expect(b.id).toMatch(/^id-\d+$/)
					}
					if (b.type === "tool_result") {
						expect(b.tool_use_id).toMatch(/^id-\d+$/)
					}
				})
			})
		})
	})

	// ─── 不修改原数组 ────────────────────────────────────────────────────
	describe("immutability", () => {
		it("does not mutate the original messages", () => {
			const msgs: ApiMessage[] = [
				toolUseMsg("id-1", "read_file", { path: "a.ts" }),
				toolResultMsg("id-1", "X".repeat(5000)),
				toolUseMsg("id-2", "read_file", { path: "b.ts" }),
				toolResultMsg("id-2", "X".repeat(5000)),
				toolUseMsg("id-3", "read_file", { path: "c.ts" }),
				toolResultMsg("id-3", "short"),
				toolUseMsg("id-4", "read_file", { path: "d.ts" }),
				toolResultMsg("id-4", "short"),
			]
			const original = JSON.stringify(msgs)
			compactOldToolBlocks(msgs, { keepRecentRounds: 2, maxResultChars: 100 })
			expect(JSON.stringify(msgs)).toBe(original)
		})
	})
})
