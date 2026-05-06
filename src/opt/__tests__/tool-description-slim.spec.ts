// npx vitest src/opt/__tests__/tool-description-slim.spec.ts

import { describe, it, expect } from "vitest"
import { slimMcpToolDefinitions } from "../tool-description-slim"
import type OpenAI from "openai"

// ─── helpers ────────────────────────────────────────────────────────────────

function nativeTool(name: string, description: string): OpenAI.Chat.ChatCompletionTool {
	return {
		type: "function",
		function: {
			name,
			description,
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "The file path. Must be relative." },
				},
				required: ["path"],
			},
		},
	}
}

function mcpTool(
	serverName: string,
	toolName: string,
	description: string,
	params?: Record<string, unknown>,
): OpenAI.Chat.ChatCompletionTool {
	return {
		type: "function",
		function: {
			name: `mcp--${serverName}--${toolName}`,
			description,
			parameters: {
				type: "object",
				properties: params ?? {
					query: {
						type: "string",
						description: "The search query. Use clear natural language.",
						examples: ["find all TypeScript files"],
						default: "",
					},
					limit: {
						type: "number",
						description: "Maximum number of results to return. Defaults to 10 if not set.",
						default: 10,
						enum: [5, 10, 20, 50],
					},
				},
				required: ["query"],
			},
		},
	}
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("slimMcpToolDefinitions", () => {
	// ─── native 工具不受影响 ─────────────────────────────────────────────
	describe("native tools – never modified", () => {
		it("passes native tools through unchanged (same reference)", () => {
			const native = nativeTool("read_file", "Read a file.")
			const result = slimMcpToolDefinitions([native], new Set())
			expect(result[0]).toBe(native)
		})
	})

	// ─── 已使用的 MCP 工具不压缩 ────────────────────────────────────────
	describe("used MCP tools – kept intact", () => {
		it("does not slim a tool that appears in usedToolNames", () => {
			const tool = mcpTool("search", "semantic_search", "Perform a semantic search across the codebase.")
			const result = slimMcpToolDefinitions([tool], new Set(["mcp--search--semantic_search"]))
			expect(result[0]).toBe(tool)
		})
	})

	// ─── 未使用的 MCP 工具: description 截断 ────────────────────────────
	describe("unused MCP tools – description truncated", () => {
		it("truncates description to first sentence", () => {
			const longDesc =
				"Perform a semantic search across the codebase. This is very powerful. Use it often."
			const tool = mcpTool("search", "semantic_search", longDesc)

			const result = slimMcpToolDefinitions([tool], new Set())
			const fn = (result[0] as OpenAI.Chat.ChatCompletionFunctionTool).function
			// Should end after first sentence (period + space detection)
			expect(fn.description).not.toContain("This is very powerful")
			expect(fn.description!.endsWith("...") || fn.description!.endsWith(".")).toBe(true)
		})

		it("truncates description to maxDescriptionLength characters", () => {
			const longDesc = "A".repeat(500)
			const tool = mcpTool("search", "big_tool", longDesc)

			const result = slimMcpToolDefinitions([tool], new Set(), { maxDescriptionLength: 50 })
			const fn = (result[0] as OpenAI.Chat.ChatCompletionFunctionTool).function
			expect(fn.description!.length).toBeLessThanOrEqual(53) // 50 + "..."
		})

		it("truncates description at first newline", () => {
			const multilineDesc = "First line only\nSecond line should be cut"
			const tool = mcpTool("search", "tool", multilineDesc)

			const result = slimMcpToolDefinitions([tool], new Set())
			const fn = (result[0] as OpenAI.Chat.ChatCompletionFunctionTool).function
			expect(fn.description).not.toContain("Second line")
		})
	})

	// ─── 未使用的 MCP 工具: schema 精简 ─────────────────────────────────
	describe("unused MCP tools – schema slimming", () => {
		it("removes enum and default from optional parameters", () => {
			const tool = mcpTool("search", "semantic_search", "Search the code.")
			const result = slimMcpToolDefinitions([tool], new Set(), { slimSchema: true })
			const fn = (result[0] as OpenAI.Chat.ChatCompletionFunctionTool).function
			const props = (fn.parameters as any).properties

			// "limit" is optional (not in required) – should lose enum/default
			expect(props.limit.enum).toBeUndefined()
			expect(props.limit.default).toBeUndefined()
		})

		it("keeps required parameters intact", () => {
			const tool = mcpTool("search", "semantic_search", "Search the code.")
			const result = slimMcpToolDefinitions([tool], new Set(), { slimSchema: true })
			const fn = (result[0] as OpenAI.Chat.ChatCompletionFunctionTool).function
			const props = (fn.parameters as any).properties

			// "query" is required – description should NOT be truncated here
			expect(props.query.description).toBe("The search query. Use clear natural language.")
		})

		it("skips schema slimming when slimSchema=false", () => {
			const tool = mcpTool("search", "semantic_search", "Search the code.")
			const result = slimMcpToolDefinitions([tool], new Set(), { slimSchema: false })
			const fn = (result[0] as OpenAI.Chat.ChatCompletionFunctionTool).function
			const props = (fn.parameters as any).properties

			// enum should still be present
			expect(props.limit.enum).toBeDefined()
		})
	})

	// ─── 混合列表: native + used MCP + unused MCP ───────────────────────
	describe("mixed tool list", () => {
		it("only slims unused MCP tools while leaving natives and used MCPs intact", () => {
			const native = nativeTool("write_to_file", "Write to a file.")
			const usedMcp = mcpTool("db", "query", "Run a database query. This is very detailed.")
			const unusedMcp = mcpTool("email", "send", "Send an email. With lots of extra detail here.")

			const tools = [native, usedMcp, unusedMcp]
			const result = slimMcpToolDefinitions(tools, new Set(["mcp--db--query"]))

			// native unchanged
			expect(result[0]).toBe(native)

			// used MCP unchanged
			expect(result[1]).toBe(usedMcp)

			// unused MCP description truncated
			const unusedFn = (result[2] as OpenAI.Chat.ChatCompletionFunctionTool).function
			expect(unusedFn.description).not.toContain("With lots of extra detail here")
		})
	})

	// ─── 不修改原数组 ────────────────────────────────────────────────────
	describe("immutability", () => {
		it("does not mutate original tool objects", () => {
			const tool = mcpTool("search", "semantic_search", "Perform a search. Extra detail here.")
			const originalDesc = (tool as OpenAI.Chat.ChatCompletionFunctionTool).function.description
			slimMcpToolDefinitions([tool], new Set())
			// Original must be unchanged
			expect((tool as OpenAI.Chat.ChatCompletionFunctionTool).function.description).toBe(originalDesc)
		})
	})
})
