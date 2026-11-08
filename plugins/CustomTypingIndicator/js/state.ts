import type { PluginApi } from '@valenced/plugins/types'

// ---------------------------------------------------------------------------------------------
// Discord's own data model (from the 351.11 decompilation: modules/custom_typing_indicator)
//
//   config = { emojis: Emoji[], typingSuggestion: number, animation: number }
//   Emoji  = { id, name: '', animated }  for a custom emoji
//          | { name }                    for a unicode emoji
//
// The chat row only draws the emoji glyph when there are exactly 3 emojis (0 is also valid).
// ---------------------------------------------------------------------------------------------

export const TypingAnimation = { UNSPECIFIED: 0, PULSE: 1, RING: 2, WAVE: 3 } as const
export const TypingSuggestion = {
	UNSPECIFIED: 0,
	YAPPING: 1,
	VENTING: 2,
	OVERSHARING: 3,
	BARKING: 4,
	BABBLING: 5,
	DAYDREAMING: 6,
	MEOWING: 7,
} as const

export interface TypingEmoji {
	id?: string
	name: string
	animated?: boolean
}

export interface TypingConfig {
	emojis: TypingEmoji[]
	typingSuggestion: number
	animation: number
}

export interface ApiOptions {
	jsonStorage: {
		/** Master switch: registry display + local editor support. */
		enabled: boolean
		/** Let people without Nitro open and use Discord's own editor screen. */
		unlockEditor: boolean
		/** The indicator saved locally from the editor (never sent to Discord). */
		mine: TypingConfig | null
	}
}

export type TypingPluginApi = PluginApi<ApiOptions>

// Filled in by the patches once Discord's modules are found.
export const runtime = {
	api: null as TypingPluginApi | null,
	/** Discord's real answer to "does this user have Nitro profile perks?", bound before patching. */
	canActuallyUse: null as null | ((user: any) => boolean),
	/** UserStore.getCurrentUser before patching, so checks never recurse into our own patch. */
	getCurrentUserRaw: null as null | (() => any),
	emitUserChange: null as null | (() => void),
	/** Which patches found their module (shown in the settings screen). */
	found: {
		experiment: false,
		premium: false,
		save: false,
		currentUser: false,
		typingStore: false,
	},
}

export function settings(): ApiOptions['jsonStorage'] | null {
	return runtime.api?.jsonStorage.cache ?? null
}

export function isEnabled(): boolean {
	return settings()?.enabled === true
}

// Real Nitro is re-checked at most every few seconds: getCurrentUser is a hot path.
let nitroMemo = { at: 0, value: true }

/**
 * True when Discord itself says this account can use profile customization.
 * Unknown (module not found yet) counts as true, so the plugin never touches a Nitro account
 * by mistake.
 */
export function hasRealNitro(): boolean {
	const now = Date.now()
	if (now - nitroMemo.at < 5000) return nitroMemo.value

	let value = true
	try {
		const user = runtime.getCurrentUserRaw?.()
		if (runtime.canActuallyUse && user) value = !!runtime.canActuallyUse(user)
	} catch {
		value = true
	}
	nitroMemo = { at: now, value }
	return value
}

export function resetNitroMemo(): void {
	nitroMemo = { at: 0, value: true }
}
