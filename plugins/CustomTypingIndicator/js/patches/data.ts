// Typing indicator data: the shared registry of plugin users (usrbg-style,
// public read-only JSON keyed by Discord user ID) plus the local user's own entry.

export type TypingAnimation = 'wave' | 'bounce' | 'pulse' | 'none'

export interface TypingEntry {
	/** Up to 3 emoji image URLs (https only). */
	emojis: string[]
	animation: TypingAnimation
	/** Text shown after the display name, e.g. "is venting..." */
	text: string
}

export const ANIMATIONS: TypingAnimation[] = ['wave', 'bounce', 'pulse', 'none']
export const MAX_TEXT = 32
export const MAX_EMOJIS = 3

// TODO: point this at your hosted registry.json (e.g. GitHub Pages in your plugin repo)
export const REGISTRY_URL = 'https://raw.githubusercontent.com/OTKUSteyler/chocos-plugins/refs/heads/main/plugins/CustomTypingIndicator/js/patches/data.json'

let registry = new Map<string, TypingEntry>()

// Registry entries are written by other people, so they are validated before they
// reach the UI: https-only images, capped counts, capped and stripped text.
export function sanitize(raw: any): TypingEntry | null {
	if (!raw || typeof raw !== 'object') return null

	const emojis = (Array.isArray(raw.emojis) ? raw.emojis : [])
		.filter((u: unknown): u is string => typeof u === 'string' && u.startsWith('https://'))
		.slice(0, MAX_EMOJIS)

	const text =
		typeof raw.text === 'string'
			? raw.text.replace(/[\u0000-\u001f]/g, '').slice(0, MAX_TEXT).trim()
			: ''
	const animation: TypingAnimation = ANIMATIONS.includes(raw.animation) ? raw.animation : 'wave'

	if (!emojis.length && !text) return null
	return { emojis, animation, text }
}

export async function fetchRegistry(): Promise<void> {
	try {
		const res = await fetch(REGISTRY_URL)
		if (!res.ok) return
		const json = await res.json()
		if (json?.version !== 1 || typeof json.users !== 'object') return

		const map = new Map<string, TypingEntry>()
		for (const [id, raw] of Object.entries(json.users)) {
			if (!/^\d{15,22}$/.test(id)) continue
			const entry = sanitize(raw)
			if (entry) map.set(id, entry)
		}
		registry = map
	} catch {
		// Offline or registry down: Discord's default indicator is used.
	}
}

export function getRegistryEntry(userId: string): TypingEntry | undefined {
	return registry.get(userId)
}

export function clearData(): void {
	registry = new Map()
}

/** JSON the user can submit to the registry maintainer ("Copy my config"). */
export function exportConfig(userId: string, entry: TypingEntry): string {
	return JSON.stringify({ [userId]: entry }, null, 2)
}

const SURPRISE_TEXTS = [
	'is venting...',
	'is plotting...',
	'is typing a novel...',
	'is cooking...',
	'is spiraling...',
	'is gossiping...',
]

export function surprise(emojiPool: string[]): TypingEntry {
	const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]
	const shuffled = [...emojiPool].sort(() => Math.random() - 0.5)
	return {
		emojis: shuffled.slice(0, MAX_EMOJIS),
		animation: pick(ANIMATIONS.filter(a => a !== 'none')),
		text: pick(SURPRISE_TEXTS),
	}
}
