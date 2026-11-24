import type { BadgeKey } from "./badges"

export interface BadgesStorage {
	order: BadgeKey[]
	shown: Record<BadgeKey, boolean>
}

export const DEFAULT_ORDER: BadgeKey[] = ["EquicordDonor", "VencordDonor", "DiscordProfile", "DiscordNitro"]

export const DEFAULTS: BadgesStorage = {
	order: [...DEFAULT_ORDER],
	shown: { EquicordDonor: true, VencordDonor: true, DiscordProfile: true, DiscordNitro: true },
}

let storage: BadgesStorage = DEFAULTS
const listeners = new Set<() => void>()

/** Called from start() with the plugin's jsonStorage; heals it if keys changed between versions. */
export function setStorage(s: BadgesStorage) {
	storage = s
	storage.order = [
		...(storage.order ?? []).filter(k => DEFAULT_ORDER.includes(k)),
		...DEFAULT_ORDER.filter(k => !(storage.order ?? []).includes(k)),
	]
	storage.shown = { ...DEFAULTS.shown, ...(storage.shown ?? {}) }
	emit()
}

export const getStorage = () => storage

export function subscribe(fn: () => void) {
	listeners.add(fn)
	return () => void listeners.delete(fn)
}

function emit() {
	for (const fn of listeners) fn()
}

export function setShown(key: BadgeKey, value: boolean) {
	storage.shown[key] = value
	emit()
}

export function move(index: number, dir: -1 | 1) {
	const target = index + dir
	if (target < 0 || target >= storage.order.length) return
	const next = [...storage.order]
	;[next[index], next[target]] = [next[target], next[index]]
	storage.order = next
	emit()
}
