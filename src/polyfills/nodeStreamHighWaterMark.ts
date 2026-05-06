/**
 * Patch Node's real `stream` module exports. `import * as stream from "node:stream"` + defineProperty
 * often mutates an interop wrapper after esbuild bundles — it does NOT fix `require("node:stream")` used
 * by dependencies, so activation can still throw: `(0, Cur.getDefaultHighWaterMark) is not a function`.
 *
 * This file uses `require()` so the same object as bundled code gets patched.
 * The esbuild `banner` in `esbuild.mjs` duplicates this at file top for maximum safety.
 */
const stream = require("node:stream") as typeof import("node:stream") & {
	getDefaultHighWaterMark?: (objectMode?: boolean) => number
	setDefaultHighWaterMark?: (objectMode: boolean, value: number) => void
}

if (typeof stream.getDefaultHighWaterMark !== "function") {
	;(stream as { getDefaultHighWaterMark: (objectMode?: boolean) => number }).getDefaultHighWaterMark = (
		objectMode?: boolean,
	) => (objectMode ? 16 : 65536)
}

if (typeof stream.setDefaultHighWaterMark !== "function") {
	;(stream as { setDefaultHighWaterMark: (objectMode: boolean, value: number) => void }).setDefaultHighWaterMark =
		() => {
			/* no-op on legacy Node */
		}
}
