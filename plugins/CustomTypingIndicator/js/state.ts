import { getRegistryEntry, type TypingEntry } from './data'
import type { PluginApi } from '@valenced/plugins/types'

export interface ApiOptions {
	jsonStorage: {
		enabled: boolean
		mine: TypingEntry
		emojiPool: string[]
	}
}

export type TypingPluginApi = PluginApi<ApiOptions>

export const runtime = {
	api: null as TypingPluginApi | null,
	currentUserId: null as string | null,
}

export function resolveEntry(userId: string | undefined): TypingEntry | undefined {
	const settings = runtime.api?.jsonStorage.cache
	if (!userId || !settings?.enabled) return undefined

	if (userId === runtime.currentUserId) {
		const mine = settings.mine
		return mine.emojis.length || mine.text ? mine : undefined
	}
	return getRegistryEntry(userId)
}
