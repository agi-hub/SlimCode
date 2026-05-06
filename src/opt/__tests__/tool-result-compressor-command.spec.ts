// npx vitest src/opt/__tests__/tool-result-compressor-command.spec.ts
// Tests for optE: maxCommandChars separate limit for execute_command

import { describe, it, expect } from "vitest"
import { compressToolResultContent } from "../tool-result-compressor"

describe("compressToolResultContent – execute_command separate limit (optE)", () => {
	it("applies maxCommandChars cap to execute_command output instead of maxChars", () => {
		// 500-char command output, general maxChars=8000 but maxCommandChars=200
		const output = "X".repeat(500)

		const result = compressToolResultContent("execute_command", output, {
			maxChars: 8000,
			maxCommandChars: 200,
		}) as string

		expect(result.length).toBeLessThan(500)
		expect(result).toContain("chars truncated")
	})

	it("does NOT apply maxCommandChars to other tools like read_file", () => {
		// 500-char content with maxCommandChars=200 — should NOT truncate read_file
		const content = "A".repeat(500)

		const result = compressToolResultContent("read_file", content, {
			maxChars: 8000,
			maxCommandChars: 200,
		}) as string

		// read_file is not execute_command; maxCommandChars should not apply
		expect(result).toBe(content)
	})

	it("falls back to maxChars when maxCommandChars is not specified for execute_command", () => {
		const output = "Y".repeat(500)

		// maxChars=8000 (default), no maxCommandChars → should NOT truncate
		const result = compressToolResultContent("execute_command", output, {
			maxChars: 8000,
		}) as string

		expect(result.length).toBeLessThan(500 + 50) // RLE might compress repeated chars
	})

	it("still applies RLE before truncation so repeated lines compress first", () => {
		// 6 identical lines followed by 400 chars — after RLE the content should shrink
		const repeatedLines = Array(6).fill("npm warn deprecated package").join("\n")
		const result = compressToolResultContent("execute_command", repeatedLines, {
			maxCommandChars: 300,
		}) as string

		// After RLE, the 6 identical lines become one "[×6]" line
		expect(result).toContain("[×6]")
		expect(result.length).toBeLessThan(repeatedLines.length)
	})

	it("treats run_command the same as execute_command for the per-command limit", () => {
		const output = "Z".repeat(500)

		const result = compressToolResultContent("run_command", output, {
			maxChars: 8000,
			maxCommandChars: 200,
		}) as string

		expect(result.length).toBeLessThan(500)
		expect(result).toContain("chars truncated")
	})

	it("respects maxCommandChars on array content blocks", () => {
		const content = [{ type: "text" as const, text: "B".repeat(500) }]

		const result = compressToolResultContent("execute_command", content, {
			maxCommandChars: 200,
		}) as Array<{ type: string; text: string }>

		expect(result[0].text.length).toBeLessThan(500)
		expect(result[0].text).toContain("chars truncated")
	})
})
