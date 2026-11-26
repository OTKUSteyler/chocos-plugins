import { callNativeMethodSync } from '@valenced/modules/native'

/** Message ID to the badge icon URLs of its author. */
export type MessageBadges = Record<string, string[]>

/** Synchronous so native knows the badges before the row that shows them is bound. */
export function putBadges(badges: MessageBadges) {
	callNativeMethodSync('dxckie.badges.put', [JSON.stringify(badges)])
}

export function clearBadges() {
	callNativeMethodSync('dxckie.badges.clear', [])
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'dxckie.badges.put': [[json: string], null]
		'dxckie.badges.clear': [[], null]
	}
}
