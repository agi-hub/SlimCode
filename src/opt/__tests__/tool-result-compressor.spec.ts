// npx vitest src/opt/__tests__/tool-result-compressor.spec.ts

import { describe, it, expect } from "vitest"
import { compressToolResultContent } from "../tool-result-compressor"

describe("compressToolResultContent", () => {
	// ─── list_files: 目录分组 ───────────────────────────────────────────
	describe("list_files – directory grouping", () => {
		it("groups files under the same directory into one line", () => {
			// Build a list of 20 files in two directories so grouping triggers (threshold=15)
			const lines: string[] = []
			for (let i = 0; i < 10; i++) lines.push(`src/core/task/file${i}.ts`)
			for (let i = 0; i < 10; i++) lines.push(`src/core/webview/file${i}.ts`)
			const input = lines.join("\n")

			const result = compressToolResultContent("list_files", input) as string

			// Should have grouped into two directory lines instead of 20 individual lines
			expect(result.split("\n").length).toBeLessThan(20)
			expect(result).toContain("src/core/task/")
			expect(result).toContain("src/core/webview/")
		})

		it("leaves short lists (< 15 lines) unchanged", () => {
			const input = ["src/a.ts", "src/b.ts", "src/c.ts"].join("\n")
			const result = compressToolResultContent("list_files", input) as string
			expect(result).toBe(input)
		})

		it("preserves the truncation notice when present", () => {
			const lines: string[] = []
			for (let i = 0; i < 10; i++) lines.push(`src/core/task/file${i}.ts`)
			for (let i = 0; i < 10; i++) lines.push(`src/core/other/file${i}.ts`)
			const input = lines.join("\n") + "\n\n(File list truncated. Use list_files on specific subdirectories if you need to explore further.)"

			const result = compressToolResultContent("list_files", input) as string
			expect(result).toContain("(File list truncated.")
		})

		it("keeps root-level files (no parent dir) as individual lines", () => {
			const lines: string[] = []
			for (let i = 0; i < 10; i++) lines.push(`root-file-${i}.ts`)
			for (let i = 0; i < 10; i++) lines.push(`src/deep/file${i}.ts`)
			const input = lines.join("\n")

			const result = compressToolResultContent("list_files", input) as string
			// Root files should still appear individually
			expect(result).toContain("root-file-0.ts")
		})

		it("limits inline file count per group (max 8 shown, rest as +N more)", () => {
			const lines: string[] = []
			for (let i = 0; i < 12; i++) lines.push(`src/core/task/file${i}.ts`)
			for (let i = 0; i < 5; i++) lines.push(`src/other/file${i}.ts`)
			// Add a few more to clear the threshold
			for (let i = 0; i < 5; i++) lines.push(`src/extra/file${i}.ts`)
			const input = lines.join("\n")

			const result = compressToolResultContent("list_files", input) as string
			// The group with 12 files should show "+4 more"
			expect(result).toContain("+4 more")
		})
	})

	// ─── read_file: 内容不做任何变换（保证 apply_diff/search_replace 能正常匹配）──
	describe("read_file – content must NOT be transformed", () => {
		it("preserves consecutive blank lines exactly as-is", () => {
			// IMPORTANT: read_file must never alter whitespace.
			// The model quotes exact text from read_file when writing apply_diff oldCode.
			// Any whitespace change here would cause "oldCode not found" errors.
			const input = "line1\n\n\n\n\nline2"
			const result = compressToolResultContent("read_file", input) as string
			expect(result).toBe(input)
		})

		it("preserves indentation and special whitespace unchanged", () => {
			const input = "function foo() {\n\t\n\t\n\t  const x = 1\n}"
			const result = compressToolResultContent("read_file", input) as string
			expect(result).toBe(input)
		})
	})

	// ─── execute_command: RLE 压缩重复行 ────────────────────────────────
	describe("execute_command – RLE for repeated lines", () => {
		it("compresses 4+ identical consecutive lines with [×N] suffix", () => {
			const input = "progress\nprogress\nprogress\nprogress\nprogress"
			const result = compressToolResultContent("execute_command", input) as string
			expect(result).toBe("progress [×5]")
		})

		it("keeps runs of 3 or fewer lines unchanged", () => {
			const input = "ok\nok\nok"
			const result = compressToolResultContent("execute_command", input) as string
			expect(result).toBe(input)
		})
	})

	// ─── search_files: 超 100 条截断 ────────────────────────────────────
	describe("search_files – result capping", () => {
		it("caps results at 100 and appends omission note", () => {
			const lines = Array.from({ length: 150 }, (_, i) => `match ${i}`)
			const input = lines.join("\n")
			const result = compressToolResultContent("search_files", input) as string
			const resultLines = result.split("\n")
			// 100 result lines + 1 omission note
			expect(resultLines.length).toBe(101)
			expect(result).toContain("[...50 more results omitted]")
		})

		it("leaves results under 100 lines unchanged", () => {
			const input = Array.from({ length: 50 }, (_, i) => `match ${i}`).join("\n")
			const result = compressToolResultContent("search_files", input) as string
			expect(result).toBe(input)
		})
	})

	// ─── 通用兜底: 超长内容 head+tail 截断 ──────────────────────────────
	describe("general fallback – head+tail truncation", () => {
		it("truncates content exceeding maxChars and inserts a summary", () => {
			const big = "A".repeat(10_000)
			const result = compressToolResultContent("read_file", big, { maxChars: 500 }) as string
			expect(result.length).toBeLessThan(big.length)
			expect(result).toContain("chars truncated")
		})

		it("leaves content under maxChars untouched", () => {
			const small = "hello world"
			const result = compressToolResultContent("read_file", small, { maxChars: 500 }) as string
			expect(result).toBe(small)
		})
	})

	// ─── array content 支持 ─────────────────────────────────────────────
	describe("array content blocks", () => {
		it("applies tool-specific compression to text blocks inside an array", () => {
			// Use execute_command (RLE is safe) to test array block processing
			const content = [
				{ type: "text" as const, text: "progress\nprogress\nprogress\nprogress\nprogress" },
			]
			const result = compressToolResultContent("execute_command", content)
			expect(Array.isArray(result)).toBe(true)
			const first = (result as any[])[0]
			expect(first.text).toBe("progress [×5]")
		})

		it("passes image blocks through unchanged", () => {
			const content = [
				{ type: "image" as const, source: { type: "base64", media_type: "image/png", data: "abc" } },
			]
			const result = compressToolResultContent("read_file", content)
			expect(result).toEqual(content)
		})
	})
})
