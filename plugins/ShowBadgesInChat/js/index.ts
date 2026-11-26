import { Dispatcher } from '@valenced/discord/common/flux'
import { Stores } from '@valenced/discord/flux'
import { getModules, lookupModule } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { clearBadges, putBadges } from './native'
import SettingsComponent from './settings'
import { DefaultSettings } from './shared'
import type { Settings } from './shared'
import type { DiscordModules } from '@valenced/discord/types'

interface RowManager {
	prototype: { generate(row: unknown): MessageRow }
}

interface MessageRow {
	type?: number
	message?: RowMessage
}

interface RowMessage {
	id?: string
	authorId?: string
	content?: ContentNode[]
	referencedMessage?: { message?: RowMessage }
}

interface ContentNode {
	type?: string
	content?: unknown
	items?: ContentNode[][]
	userId?: string
}

const MessageRowType = 1
let sentBadges = false

// Tells the native image hook the icon is ours, so it draws it unrounded
const IconMarker = '#dxckie.show-badges'

type Http = {
	HTTP: { get(options: { url: string }): Promise<{ body?: unknown }> }
}

const TTL = 30 * 60 * 1000
const FetchGap = 400

// userId -> badge icon URLs, in the order the profile shows them
const cache = new Map<
	string,
	{ at: number; uris: string[]; nodes: ContentNode[] }
>()
const CacheLimit = 500
const queue = new Set<string>()
let running = false
let active = false
let http: Http | undefined
let settings: Settings = DefaultSettings

// Badges from other client mods, the same list the Global Badges plugin uses.
// Kept as downloaded and read per user, instead of copying the whole list
type GlobalUsers = Record<string, { mod?: unknown; badge?: unknown }[]>
let globalUsers: GlobalUsers = {}
let globalAt = 0

async function loadGlobal() {
	if (Date.now() - globalAt < TTL) return
	globalAt = Date.now()
	try {
		const response = await fetch('https://badges.equicord.org/users', {
			cache: 'no-cache',
		})
		if (!response.ok) return
		const { users } = (await response.json()) as { users?: GlobalUsers }
		if (users && typeof users === 'object') globalUsers = users
	} catch {
		// Keeps the last list, and the next try waits for the TTL
	}
}

function globalUris(userId: string): string[] {
	const list = globalUsers[userId]
	if (!Array.isArray(list)) return []
	return list.flatMap(({ mod, badge }) =>
		typeof badge === 'string' &&
		/^https?:\/\//i.test(badge) &&
		String(mod).toLowerCase() !== 'valenced'
			? [badge]
			: [],
	)
}

// Nodes Discord caches are copied, never edited, so ones already patched are remembered
const patched = new WeakSet<ContentNode>()

// The profile endpoint lists every badge the profile shows (Nitro, boosts, quests, ...)
function toUris(body: unknown): string[] {
	const badges = (body as { badges?: unknown })?.badges
	if (!Array.isArray(badges)) return []
	return badges.flatMap(({ icon }: { icon?: unknown }) =>
		typeof icon === 'string' && /^\w+$/.test(icon)
			? [`https://cdn.discordapp.com/badge-icons/${icon}.png`]
			: [],
	)
}

// Messages keep the mention they were first rendered with. Flipping a message
// flag Discord doesn't use is a change it notices, so it rebuilds the row, and
// unlike a content change it is not an edit, so loggers like Message Logger
// don't record it. Users finishing close together share one pass over the channel
const RedrawFlag = 1 << 30
const dirty = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function redraw(userId: string) {
	dirty.add(userId)
	flushTimer ??= setTimeout(flush, 300)
}

function flush() {
	flushTimer = undefined
	const ids = new Set([...dirty].filter(id => /^\d+$/.test(id)))
	dirty.clear()

	const channelId = (
		Stores.SelectedChannelStore as DiscordModules.Flux.Store<{
			getChannelId(): string | undefined
		}>
	).getChannelId()
	if (!channelId || !ids.size) return

	const MessageStore = Stores.MessageStore as DiscordModules.Flux.Store<{
		getMessages(channelId: string): {
			toArray(): {
				id: string
				content?: string
				flags?: number
				author?: { id?: string }
			}[]
		}
	}>
	const mention = new RegExp(`<@!?(?:${[...ids].join('|')})>`)

	for (const { id, content, flags, author } of MessageStore.getMessages(
		channelId,
	).toArray()) {
		const byUser = !!author?.id && ids.has(author.id)
		if (!byUser && !(content && mention.test(content))) continue
		Dispatcher.dispatch({
			type: 'MESSAGE_UPDATE',
			message: { id, channel_id: channelId, flags: (flags ?? 0) ^ RedrawFlag },
		})
	}
}

// One profile at a time with a gap, so a busy channel doesn't hammer Discord
async function drain() {
	if (running) return
	running = true
	try {
		while (active && queue.size) {
			const [userId] = queue
			queue.delete(userId)
			const before = cache.get(userId)?.uris.join()

			const useGlobal = settings.global || settings.globalOnly
			if (useGlobal) await loadGlobal()
			let uris: string[] = []
			try {
				if (settings.globalOnly) throw 0
				http ??= lookupModule(withProps('HTTP', 'post'))[0] as Http | undefined
				const { body } = await http!.HTTP.get({
					url: `/users/${userId}/profile?with_mutual_guilds=false&with_mutual_friends_count=false`,
				})
				uris = toUris(body)
			} catch {
				// Cached empty so a failing profile isn't retried until the TTL ends,
				// and skipped when only Global Badges are wanted
			}

			if (useGlobal) uris = [...new Set([...uris, ...globalUris(userId)])]
			cache.delete(userId)
			cache.set(userId, {
				at: Date.now(),
				uris,
				nodes: uris.map(icon => ({
					type: 'guild',
					content: '',
					icon: icon + IconMarker,
				})),
			})
			// Oldest entries go first (Map keeps insertion order)
			if (cache.size > CacheLimit) cache.delete(cache.keys().next().value!)
			if (active && uris.join() !== (before ?? '')) redraw(userId)
			await new Promise(resolve => setTimeout(resolve, FetchGap))
		}
	} finally {
		running = false
	}
}

function badgeNodes(userId: string): ContentNode[] {
	const entry = cache.get(userId)
	if (!entry || Date.now() - entry.at > TTL) {
		queue.add(userId)
		void drain()
	}
	return entry?.nodes ?? []
}

// Badges go right after the mention, outside its highlight, which is measured
// too short for the icons and cuts off the last one
function withBadges(nodes: ContentNode[]): ContentNode[] {
	let changed = false
	const result = nodes.flatMap(node => {
		const updated = withBadge(node)
		if (updated.length !== 1 || updated[0] !== node) changed = true
		return updated
	})
	return changed ? result : nodes
}

function withBadge(node: ContentNode): ContentNode[] {
	if (patched.has(node)) return [node]

	if (node.type === 'mention' && node.userId) {
		const badges = badgeNodes(node.userId)
		if (!badges.length) return [node]
		// The copy is remembered, so a row built again from patched content gets no second set
		const copy = { ...node }
		patched.add(copy)
		return [copy, ...badges]
	}

	// Formatting nodes can hold mentions too
	if (Array.isArray(node.content)) {
		const content = withBadges(node.content)
		if (content !== node.content) return [{ ...node, content }]
	}

	if (node.type === 'list' && node.items) {
		const items = node.items.map(withBadges)
		if (items.some((item, i) => item !== node.items![i]))
			return [{ ...node, items }]
	}

	return [node]
}

export default plugin<{ jsonStorage: Settings }>({
	jsonStorage: { load: true, default: DefaultSettings },
	start({ cleanup, plugin, jsonStorage: storage }) {
		active = true
		const sync = () => {
			settings = { ...DefaultSettings, ...storage.cache }
			// Badges are rebuilt under the new settings, and shown messages redrawn
			const ids = [...cache.keys()]
			cache.clear()
			queue.clear()
			for (const id of ids) redraw(id)
		}
		settings = { ...DefaultSettings, ...storage.cache }
		cleanup(storage.subscribe(sync))
		cleanup(() => {
			clearBadges()
			sentBadges = false
			active = false
			queue.clear()
			cache.clear()
			dirty.clear()
			clearTimeout(flushTimer)
			flushTimer = undefined
			globalUsers = {}
		})

		const patch = (message: RowMessage) => {
			if (settings.ping && message.content)
				message.content = withBadges(message.content)
		}

		cleanup(
			// modules/messages/native/renderer/RowGenerator.tsx
			getModules(withName<RowManager>('RowManager'), ({ prototype }) => {
				cleanup(
					after(prototype, 'generate', row => {
						const message = row?.type === MessageRowType ? row.message : null
						if (!message) return row

						try {
							if (message.id && message.authorId) {
								// Native shows these beside the name in the message header
								const uris = settings.username
									? (cache.get(message.authorId)?.uris ?? [])
									: []
								if (settings.username) badgeNodes(message.authorId)
								// Nothing to tell native until a message has had badges
								if (uris.length || sentBadges) {
									sentBadges = true
									putBadges({ [message.id]: uris })
								}
							}
							patch(message)
							const reply = message.referencedMessage?.message
							if (reply) patch(reply)
						} catch (e) {
							plugin.reportError(
								`Failed to add badges: ${getErrorStack(e)}`,
							)
						}

						return row
					}),
				)
			}),
		)
	},
	SettingsComponent,
})
