import { DEFAULTS, type NativeState, type CapriStorage, callNative } from "../native"
import { showToast } from "../../../../shared/toast"
import type { JsonStorage } from "@valenced/json-storage"
import * as React from "react"
import { reportError } from "../../../../shared/report"

/** Sub-pages are separate routes with no `api` prop, so the storage handle is set once in start(). */
let storage: JsonStorage<CapriStorage> | undefined

export function setStorage(handle: JsonStorage<CapriStorage>) {
	storage = handle
}

/**
 * Brings the storage mirror in line with native, which owns the values. Quick Toggles flips
 * settings through native `setSettings`, which never reaches this storage, so pages showed the old
 * values until a restart. Run when a page opens, and by Quick Toggles through the global hook below
 * right after it changes something. Only keys the storage has are copied.
 */
export function syncFromNative(): Promise<void> {
	return callNative("getSettings")
		.then((state: NativeState) => {
			if (!state || typeof state.show !== "boolean" || !storage) return
			const stored: Record<string, unknown> = {}
			for (const key of Object.keys(DEFAULTS)) if (key in state) stored[key] = (state as any)[key]
			storage.set(stored as Partial<CapriStorage>)
		})
		.catch(error => reportError("[Capri] getSettings failed:", error))
}

/** `globalThis.__bleelblepSettingsSync[pluginId]`: how Quick Toggles asks a plugin to re-read native. */
export function registerSync(id: string, sync: () => unknown): () => void {
	const g = globalThis as any
	g.__bleelblepSettingsSync ??= {}
	g.__bleelblepSettingsSync[id] = sync
	return () => {
		if (g.__bleelblepSettingsSync?.[id] === sync) delete g.__bleelblepSettingsSync[id]
	}
}

/** The saved settings, re-rendering on change, re-read from native when the page opens. Call like a hook. */
export function useSettings(): CapriStorage {
	React.useEffect(() => {
		syncFromNative()
	}, [])
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

/** The saved settings right now, outside React (the spell handler outlives a restart's handle). */
export function savedSettings(): CapriStorage {
	return { ...DEFAULTS, ...((storage as any)?.cache ?? {}) }
}

/** Saves a change and hands it to native, which applies it straight away. */
export function update(patch: Partial<CapriStorage>) {
	storage?.set(patch)
	callNative("setSettings", [patch]).catch(error => reportError("[Capri] setSettings failed:", error))
}

/** Native's live numbers (times petted, things eaten), read when a page opens. Call like a hook. */
export function useNativeState(): NativeState | null {
	const [state, setState] = React.useState<NativeState | null>(null)
	React.useEffect(() => {
		callNative("getSettings")
			.then(setState)
			.catch(error => reportError("[Capri] getSettings failed:", error))
	}, [])
	return state
}

export function toast(content: string) {
	try {
		showToast(content, "capri-pet")
	} catch {
		/* a missing toast is never worth a crash */
	}
}

/** A one-off native action (recenter, giveBack, blow...); says so when it doesn't go through. */
export function call(name: string) {
	callNative(name).catch(error => {
		reportError(`[Capri] ${name} failed:`, error)
		toast("Capri-Pet didn't respond. Is it switched on?")
	})
}

/**
 * A pet's animation for the settings page, rendered by native: every frame in one image (a grid,
 * [cols] across, [n] frames), its rate, one frame's size in screen pixels, and for a fidget which
 * animation it plays. One image rather than one per frame: changing an image's source blanks it for
 * a moment, which flickered.
 */
export interface PreviewAnimation {
	sheet: string
	cols: number
	n: number
	fps: number
	/** One frame, in screen pixels: shown at w / PixelRatio dp so nothing is resampled. */
	w: number
	h: number
}

const animations = new Map<string, PreviewAnimation>()
/** The big preview and the tester. */
const CACHE_SIZE = 64

/** [targetPx]: how big the page shows it, in screen pixels; native picks the biggest whole-number scale that fits. */
export function usePreviewFrames(pose = "IDLE", variant = 0, targetPx = 0): PreviewAnimation | undefined {
	const key = `${pose}:${variant}:${targetPx}`
	const [value, setValue] = React.useState<PreviewAnimation & { key: string }>()
	React.useEffect(() => {
		let active = true
		const cached = animations.get(key)
		if (cached) {
			setValue({ key, ...cached })
			return
		}
		callNative("previewFrames", [pose, variant, targetPx])
			.then((result: Partial<PreviewAnimation>) => {
				if (!active) return
				if (typeof result?.sheet !== "string" || !result.n || !result.w || !result.h) return
				const anim: PreviewAnimation = {
					sheet: result.sheet, cols: result.cols || 1, n: result.n, fps: result.fps || 8, w: result.w, h: result.h,
				}
				// Keep the page from retaining every pet/pose PNG in memory.
				if (animations.size >= CACHE_SIZE) animations.delete(animations.keys().next().value!)
				animations.set(key, anim)
				setValue({ key, ...anim })
			})
			.catch(error => {
				if (active) {
					reportError("[Capri] previewFrames failed:", error)
					toast("Couldn't load this animation. Update Capri-Pet and restart Discord.")
				}
			})
		return () => { active = false }
	}, [key, pose, variant, targetPx])
	return value?.key === key ? value : undefined
}
