import type { ProviderSettings } from "@roo-code/types"

import { singleCompletionHandler } from "../../utils/single-completion-handler"

interface FallbackHintInput {
	task: string
	recentContext: string
}

function buildFallbackHintPrompt(input: FallbackHintInput): string {
	return `You are a senior coding assistant helping another model that is currently stuck.
Your job: provide concise, high-signal guidance only.

Task:
${input.task || "(unknown task)"}

Recent execution context:
${input.recentContext || "(no recent context)"}

Return exactly:
1) Root cause hypothesis (1-2 lines)
2) Next best action (1-3 concrete steps)
3) What to avoid (one line)

Keep this under 180 words. No markdown code fences.`
}

export async function generateHintFromFallbackProvider(
	fallbackConfig: ProviderSettings,
	input: FallbackHintInput,
): Promise<string | null> {
	try {
		if (!fallbackConfig?.apiProvider) {
			return null
		}

		const prompt = buildFallbackHintPrompt(input)
		const completion = await singleCompletionHandler(fallbackConfig, prompt)
		const normalized = completion.trim()
		return normalized.length > 0 ? normalized : null
	} catch (error) {
		console.error("[hint-injector] Failed to generate fallback hint:", error)
		return null
	}
}
