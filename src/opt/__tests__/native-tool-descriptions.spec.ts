// npx vitest src/opt/__tests__/native-tool-descriptions.spec.ts
// Verifies that the slimmed native tool descriptions are still correct and shorter than before.

import { describe, it, expect } from "vitest"
import codebaseSearch from "../../core/prompts/tools/native-tools/codebase_search"
import searchFiles from "../../core/prompts/tools/native-tools/search_files"
import listFiles from "../../core/prompts/tools/native-tools/list_files"

// Character counts of the original (pre-G) descriptions (measured before editing).
// The new descriptions must be strictly shorter, confirming token savings.
const ORIGINAL_LENGTHS = {
	codebase_search: 630,
	search_files: 600,
	list_files: 530,
}

describe("codebase_search tool definition (optG)", () => {
	it("has a shorter description than the original", () => {
		const desc = codebaseSearch.function.description
		expect(desc.length).toBeLessThan(ORIGINAL_LENGTHS.codebase_search)
	})

	it("retains the CRITICAL instruction about using it first for unexplored code", () => {
		const desc = codebaseSearch.function.description
		expect(desc.toLowerCase()).toContain("critical")
		expect(desc.toLowerCase()).toContain("first")
	})

	it("retains the English-only query requirement", () => {
		const desc = codebaseSearch.function.description
		expect(desc.toLowerCase()).toContain("english")
	})

	it("has valid required parameters: query and path", () => {
		const params = codebaseSearch.function.parameters
		expect(params.required).toContain("query")
		expect(params.required).toContain("path")
	})

	it("query parameter description mentions meaning-based search", () => {
		const props = codebaseSearch.function.parameters.properties as Record<string, { description: string }>
		expect(props.query.description.toLowerCase()).toContain("meaning")
	})
})

describe("search_files tool definition (optG)", () => {
	it("has a shorter description than the original", () => {
		const desc = searchFiles.function.description
		expect(desc.length).toBeLessThan(ORIGINAL_LENGTHS.search_files)
	})

	it("retains mention of regex and Rust syntax", () => {
		const desc = searchFiles.function.description.toLowerCase()
		expect(desc).toContain("regex")
		expect(desc).toContain("rust")
	})

	it("has valid required parameters: path and regex", () => {
		const params = searchFiles.function.parameters
		expect(params.required).toContain("path")
		expect(params.required).toContain("regex")
	})

	it("mentions optional file_pattern parameter", () => {
		const desc = searchFiles.function.description.toLowerCase()
		expect(desc).toContain("file_pattern")
	})
})

describe("list_files tool definition (optG)", () => {
	it("has a shorter description than the original", () => {
		const desc = listFiles.function.description
		expect(desc.length).toBeLessThan(ORIGINAL_LENGTHS.list_files)
	})

	it("warns against using it to verify file creation", () => {
		const desc = listFiles.function.description.toLowerCase()
		expect(desc).toContain("creat")
	})

	it("has valid required parameters: path and recursive", () => {
		const params = listFiles.function.parameters
		expect(params.required).toContain("path")
		expect(params.required).toContain("recursive")
	})

	it("recursive parameter description mentions true/false semantics", () => {
		const props = listFiles.function.parameters.properties as Record<string, { description: string }>
		const desc = props.recursive.description.toLowerCase()
		expect(desc).toContain("true")
		expect(desc).toContain("false")
	})
})
