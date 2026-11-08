import { TypingAnimation, TypingSuggestion } from './state'
import type { TypingConfig, TypingEmoji } from './state'

// Same hosting style as UserPFP: one JSON file in a GitHub repo, read through raw.githubusercontent.com.
// To add or change an indicator, edit source/data.json in that repo (or open a pull request).
export const REGISTRY_URL =
	'https://raw.githubusercontent.com/OTKUSteyler/chocos-plugins/main/source/data.json'

// Entries are written by other people, so everything is validated before it reaches Discord's UI.
const SNOWFLAKE = /^\d{15,22}$/
const MAX_UNICODE_EMOJI_LENGTH = 16
const EMOJI_COUNT = 3

let entries = new Map<string, TypingConfig>()

function byNameOrNumber(table: Record<string, number>, value: unknown): number | null {
	if (typeof value === 'number') {
		return Object.values(table).includes(value) ? value : null
	}
	if (typeof value === 'string') {
		const found = table[value.toUpperCase()]
		return found === undefined ? null : found
	}
	return null
}

function parseEmoji(raw: unknown): TypingEmoji | null {
	if (typeof raw === 'string') {
		if (SNOWFLAKE.test(raw)) return { id: raw, name: '', animated: false }
		const name = raw.trim()
		if (!name || name.length > MAX_UNICODE_EMOJI_LENGTH || /[a-z0-9:/]/i.test(name)) return null
		return { name }
	}
	if (raw && typeof raw === 'object') {
		const item = raw as Record<string, unknown>
		const id = item.id ?? item.custom_emoji_id
		if (typeof id === 'string' && SNOWFLAKE.test(id)) {
			return { id, name: '', animated: item.animated === true }
		}
	}
	return null
}

/** Accepts the registry/export format, returns Discord's own client-side config shape. */
export function parseEntry(raw: any): TypingConfig | null {
	if (!raw || typeof raw !== 'object') return null

	const emojiList: unknown[] = Array.isArray(raw.emojis) ? raw.emojis : []
	const emojis = emojiList.map(parseEmoji)
	// Discord only accepts "no emojis" or exactly 3.
	if (emojis.some(e => e === null)) return null
	if (emojis.length !== 0 && emojis.length !== EMOJI_COUNT) return null

	const animation = byNameOrNumber(TypingAnimation, raw.animation ?? 0)
	const typingSuggestion = byNameOrNumber(
		TypingSuggestion,
		raw.typing_suggestion ?? raw.typingSuggestion ?? 0,
	)
	if (animation === null || typingSuggestion === null) return null
	if (emojis.length === 0 && typingSuggestion === 0) return null

	return { emojis: emojis as TypingEmoji[], typingSuggestion, animation }
}

function nameOf(table: Record<string, number>, value: number): string {
	return Object.keys(table).find(key => table[key] === value) ?? 'UNSPECIFIED'
}

/** The entry to paste into the registry, built from the locally saved config. */
export function toRegistryEntry(config: TypingConfig): Record<string, unknown> {
	return {
		emojis: config.emojis.map(emoji =>
			emoji.id ? (emoji.animated ? { id: emoji.id, animated: true } : emoji.id) : emoji.name,
		),
		animation: nameOf(TypingAnimation, config.animation),
		typing_suggestion: nameOf(TypingSuggestion, config.typingSuggestion),
	}
}

export async function fetchRegistry(): Promise<number> {
	try {
		const response = await fetch(REGISTRY_URL)
		if (!response.ok) return entries.size
		const json = await response.json()
		if (json?.version !== 1 || !json.users || typeof json.users !== 'object') return entries.size

		const next = new Map<string, TypingConfig>()
		for (const [id, raw] of Object.entries(json.users)) {
			if (!SNOWFLAKE.test(id)) continue
			const entry = parseEntry(raw)
			if (entry) next.set(id, entry)
		}
		entries = next
	} catch {
		// Offline or registry down: Discord's own behavior is used.
	}
	return entries.size
}

export function getRegistryEntry(userId: string): TypingConfig | undefined {
	return entries.get(userId)
}

export function registrySize(): number {
	return entries.size
}

export function clearRegistry(): void {
	entries = new Map()
}
