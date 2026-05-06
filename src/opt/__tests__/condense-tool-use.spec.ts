// npx vitest src/opt/__tests__/condense-tool-use.spec.ts

import { describe, it, expect } from "vitest"
import { toolUseToText, toolResultToText } from "../../core/condense/index"
import type Anthropic from "@anthropic-ai/sdk"

describe("toolUseToText – compact single-line JSON (C+H)", () => {
	it("formats a simple flat input as a single-line JSON object", () => {
		const block: Anthropic.Messages.ToolUseBlockParam = {
			type: "tool_use",
			id: "tu_1",
			name: "read_file",
			input: { path: "src/foo.ts" },
		}

		const result = toolUseToText(block)

		expect(result).toBe(`[Tool Use: read_file] {"path":"src/foo.ts"}`)
	})

	it("does NOT use newlines or indentation in JSON output", () => {
		const block: Anthropic.Messages.ToolUseBlockParam = {
			type: "tool_use",
			id: "tu_2",
			name: "apply_diff",
			input: {
				path: "src/foo.ts",
				diff: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new",
			},
		}

		const result = toolUseToText(block)

		// Must not contain indented JSON (no leading whitespace before keys)
		expect(result).not.toMatch(/\n\s+"/)
		// Must be a single-line JSON object after the header
		const jsonPart = result.replace("[Tool Use: apply_diff] ", "")
		expect(() => JSON.parse(jsonPart)).not.toThrow()
		const parsed = JSON.parse(jsonPart)
		expect(parsed.path).toBe("src/foo.ts")
	})

	it("handles nested objects compactly", () => {
		const block: Anthropic.Messages.ToolUseBlockParam = {
			type: "tool_use",
			id: "tu_3",
			name: "some_tool",
			input: { outer: { inner: { deep: 42 } } },
		}

		const result = toolUseToText(block)

		expect(result).toBe(`[Tool Use: some_tool] {"outer":{"inner":{"deep":42}}}`)
	})

	it("handles non-object input (string) gracefully", () => {
		const block: Anthropic.Messages.ToolUseBlockParam = {
			type: "tool_use",
			id: "tu_4",
			name: "raw_tool",
			input: "plain string input" as unknown as Record<string, unknown>,
		}

		const result = toolUseToText(block)
		expect(result).toBe("[Tool Use: raw_tool] plain string input")
	})

	it("produces significantly fewer characters than the old indented format for nested objects", () => {
		// Old format used JSON.stringify(value, null, 2) for nested objects — very verbose.
		// New format always uses compact JSON.stringify(input).
		const nestedInput = {
			changes: [
				{ file: "src/a.ts", action: "modify", line: 10 },
				{ file: "src/b.ts", action: "create", line: 1 },
				{ file: "src/c.ts", action: "delete", line: 50 },
			],
		}
		const block: Anthropic.Messages.ToolUseBlockParam = {
			type: "tool_use",
			id: "tu_5",
			name: "batch_edit",
			input: nestedInput,
		}

		// Simulate old format: key: value\n, nested objects with 2-space indent
		const oldStyleText = `[Tool Use: batch_edit]\n` + `changes: ${JSON.stringify(nestedInput.changes, null, 2)}`
		const oldStyleLength: number = oldStyleText.length

		const result = toolUseToText(block)
		// New format (compact JSON) must be shorter than old format (indented JSON)
		expect(result.length).toBeLessThan(oldStyleLength)
	})
})

describe("toolResultToText – unchanged behaviour", () => {
	it("handles string content", () => {
		const block: Anthropic.Messages.ToolResultBlockParam = {
			type: "tool_result",
			tool_use_id: "tu_1",
			content: "some output",
		}
		expect(toolResultToText(block)).toBe("[Tool Result]\nsome output")
	})

	it("handles array content with text and image blocks", () => {
		const block: Anthropic.Messages.ToolResultBlockParam = {
			type: "tool_result",
			tool_use_id: "tu_2",
			content: [
				{ type: "text", text: "output line" },
				{ type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
			],
		}
		const result = toolResultToText(block)
		expect(result).toContain("output line")
		expect(result).toContain("[Image]")
	})

	it("appends (Error) suffix for error results", () => {
		const block: Anthropic.Messages.ToolResultBlockParam = {
			type: "tool_result",
			tool_use_id: "tu_3",
			content: "failed",
			is_error: true,
		}
		expect(toolResultToText(block)).toBe("[Tool Result (Error)]\nfailed")
	})
})
