// npx vitest src/opt/__tests__/env-details-trimmer.spec.ts

import { describe, it, expect } from "vitest"
import { trimOldEnvironmentDetails } from "../env-details-trimmer"
import type { ApiMessage } from "../../core/task-persistence/apiMessages"

const envBlock = (extra = "") =>
	`<environment_details>\nCurrent Time: 2024-01-01\nCWD: /workspace${extra}\n</environment_details>`

const makeUser = (text: string): ApiMessage => ({
	role: "user",
	content: [{ type: "text", text }],
})

const makeAssistant = (text: string): ApiMessage => ({
	role: "assistant",
	content: [{ type: "text", text }],
})

describe("trimOldEnvironmentDetails", () => {
	it("returns messages unchanged when there are too few user messages to trim", () => {
		const msgs: ApiMessage[] = [makeUser(envBlock()), makeAssistant("ok")]
		const result = trimOldEnvironmentDetails(msgs, { keepRecentRounds: 1 })
		expect(result).toEqual(msgs)
	})

	it("replaces environment_details in old user messages with placeholder", () => {
		const msgs: ApiMessage[] = [
			makeUser(envBlock(" round1")),
			makeAssistant("reply1"),
			makeUser(envBlock(" round2")),
			makeAssistant("reply2"),
			makeUser(envBlock(" round3")), // ← most recent, should be kept
			makeAssistant("reply3"),
		]

		const result = trimOldEnvironmentDetails(msgs, { keepRecentRounds: 1 })

		// Oldest user message should be replaced
		const firstUserContent = result[0].content as Array<{ type: string; text: string }>
		expect(firstUserContent[0].text).toBe("[environment_details omitted]")

		// Second user message should also be replaced
		const secondUserContent = result[2].content as Array<{ type: string; text: string }>
		expect(secondUserContent[0].text).toBe("[environment_details omitted]")

		// Most recent user message should remain intact
		const latestUserContent = result[4].content as Array<{ type: string; text: string }>
		expect(latestUserContent[0].text).toContain("<environment_details>")
	})

	it("keeps the last N user messages intact based on keepRecentRounds", () => {
		const msgs: ApiMessage[] = [
			makeUser(envBlock(" r1")),
			makeAssistant("a1"),
			makeUser(envBlock(" r2")),
			makeAssistant("a2"),
			makeUser(envBlock(" r3")),
			makeAssistant("a3"),
			makeUser(envBlock(" r4")),
		]

		// Keep 2 most recent user messages
		const result = trimOldEnvironmentDetails(msgs, { keepRecentRounds: 2 })

		const u1 = result[0].content as Array<{ type: string; text: string }>
		const u2 = result[2].content as Array<{ type: string; text: string }>
		const u3 = result[4].content as Array<{ type: string; text: string }>
		const u4 = result[6].content as Array<{ type: string; text: string }>

		expect(u1[0].text).toBe("[environment_details omitted]")
		expect(u2[0].text).toBe("[environment_details omitted]")
		expect(u3[0].text).toContain("<environment_details>")
		expect(u4[0].text).toContain("<environment_details>")
	})

	it("does not modify non-environment_details text blocks in user messages", () => {
		const msgs: ApiMessage[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Please help me with X" },
					{ type: "text", text: envBlock() },
				],
			},
			makeAssistant("sure"),
			{
				role: "user",
				content: [{ type: "text", text: "Thanks" + envBlock() }],
			},
		]

		const result = trimOldEnvironmentDetails(msgs, { keepRecentRounds: 1 })

		// First user message: the plain text block should be untouched, env block replaced
		const firstContent = result[0].content as Array<{ type: string; text: string }>
		expect(firstContent[0].text).toBe("Please help me with X")
		expect(firstContent[1].text).toBe("[environment_details omitted]")
	})

	it("leaves assistant messages completely unmodified", () => {
		const msgs: ApiMessage[] = [
			makeUser(envBlock()),
			makeAssistant("some assistant reply with <environment_details>data</environment_details>"),
			makeUser(envBlock()),
		]

		const result = trimOldEnvironmentDetails(msgs, { keepRecentRounds: 1 })

		// Assistant message should never be touched
		expect(result[1]).toEqual(msgs[1])
	})

	it("returns a new array (does not mutate the original)", () => {
		const msgs: ApiMessage[] = [makeUser(envBlock(" r1")), makeAssistant("a1"), makeUser(envBlock(" r2"))]
		const original = JSON.parse(JSON.stringify(msgs))
		trimOldEnvironmentDetails(msgs, { keepRecentRounds: 1 })
		expect(msgs).toEqual(original)
	})

	it("skips user messages whose text does not look like a standalone env block", () => {
		// Text that starts with env_details but has extra content after — not a standalone block
		const notStandalone = "<environment_details>\ndata\n</environment_details>\n\nextra content"
		const msgs: ApiMessage[] = [makeUser(notStandalone), makeAssistant("ok"), makeUser(envBlock())]

		const result = trimOldEnvironmentDetails(msgs, { keepRecentRounds: 1 })
		// notStandalone does not end with </environment_details> when trimmed → not replaced
		const u1 = result[0].content as Array<{ type: string; text: string }>
		expect(u1[0].text).toBe(notStandalone)
	})
})
