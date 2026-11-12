import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

// Flip to false once everything works.
const DEBUG = true

function dbg(...args: unknown[]) {
	if (DEBUG) console.log('[gifroulette]', ...args)
}

const ApplicationCommandType = {
	CHAT: 1,
	USER: 2,
	MESSAGE: 3,
} as const

const ApplicationCommandInputType = {
	BUILT_IN: 0,
	BUILT_IN_TEXT: 1,
	BUILT_IN_INTEGRATION: 2,
	BOT: 3,
	PLACEHOLDER: 4,
} as const

const ApplicationCommandOptionType = {
	STRING: 3,
} as const

interface CommandContext {
	channel: { id: string }
}

interface ApplicationCommandChoice {
	name: string
	value: string
	displayName?: string
}

interface ApplicationCommandOption {
	name: string
	description: string
	displayName?: string
	displayDescription?: string
	type: number
	required?: boolean
	choices?: ApplicationCommandChoice[]
}

interface ApplicationCommand {
	id?: string
	name: string
	displayName?: string
	untranslatedName?: string
	description: string
	displayDescription?: string
	untranslatedDescription?: string
	options: ApplicationCommandOption[]
	execute(args: unknown[], ctx: CommandContext): unknown
	applicationId?: string
	inputType?: number
	type?: number
}

type GetBuiltInCommands = (
	type: number | number[],
	...rest: unknown[]
) => ApplicationCommand[]

interface CommandsModule {
	getBuiltInCommands: GetBuiltInCommands
}

interface MessageUtil {
	sendMessage(
		channelId: string,
		message: { content: string },
		invalidEmojis?: undefined,
		options?: { nonce?: string },
	): unknown
	editMessage(...args: unknown[]): unknown
}

// Discord stores favorites as { [url]: { format, src, width, height, order } }
type FavoriteGif = { src?: string; format?: number } & Record<string, unknown>
type GifMap = Record<string, FavoriteGif>

// ---------------------------------------------------------------------------
// GIF providers (Discord only uses Tenor, Giphy and Klipy)
// ---------------------------------------------------------------------------

const PROVIDER_HOSTS: Record<string, string[]> = {
	tenor: ['tenor.com', 'tenor.co'],
	giphy: ['giphy.com', 'gph.is'],
	klipy: ['klipy.com'],
}

const PROVIDER_CHOICES = ['all', ...Object.keys(PROVIDER_HOSTS), 'other']

function hostOf(url: string | undefined): string | undefined {
	if (!url) return undefined
	try {
		return new URL(url).hostname.toLowerCase()
	} catch {
		return undefined
	}
}

function hostMatches(host: string, domain: string): boolean {
	return host === domain || host.endsWith(`.${domain}`)
}

function classify(url: string, gif: FavoriteGif | undefined): string {
	// Check both the favorite's key (usually the page/share URL) and its src
	// (the media URL); either one can reveal the provider.
	const hosts = [hostOf(url), hostOf(gif?.src)].filter(Boolean) as string[]
	for (const [provider, domains] of Object.entries(PROVIDER_HOSTS)) {
		if (hosts.some(h => domains.some(d => hostMatches(h, d)))) return provider
	}
	return 'other'
}

// ---------------------------------------------------------------------------
// Favorites discovery
// ---------------------------------------------------------------------------

function toGifMap(v: unknown): GifMap | undefined {
	if (!v) return undefined
	if (v instanceof Map) return Object.fromEntries(v) as GifMap
	if (typeof v === 'object') return v as GifMap
	return undefined
}

// Depth-limited search for a `favoriteGifs.gifs` object anywhere inside `root`.
function deepFindFavorites(root: unknown, maxDepth = 4): GifMap | undefined {
	const seen = new Set<unknown>()
	let budget = 3000

	function walk(node: unknown, depth: number): GifMap | undefined {
		if (!node || typeof node !== 'object' || budget-- <= 0) return undefined
		if (seen.has(node)) return undefined
		seen.add(node)

		const direct = toGifMap((node as any).favoriteGifs?.gifs)
		if (direct && Object.keys(direct).length > 0) return direct
		if (depth >= maxDepth) return undefined

		let keys: string[] = []
		try {
			keys = Object.keys(node)
		} catch {}
		for (const key of keys) {
			let child: unknown
			try {
				child = (node as any)[key]
			} catch {
				continue
			}
			const found = walk(child, depth + 1)
			if (found) return found
		}
		return undefined
	}

	return walk(root, 0)
}

function protoNames(obj: any): string[] {
	const names = new Set<string>()
	try {
		for (const k of Object.keys(obj)) names.add(k)
		let p = Object.getPrototypeOf(obj)
		for (let i = 0; p && p !== Object.prototype && i < 3; i++) {
			for (const k of Object.getOwnPropertyNames(p)) names.add(k)
			p = Object.getPrototypeOf(p)
		}
	} catch {}
	return [...names].slice(0, 40)
}

let commands: ApplicationCommand[] = []

const NoFavorites =
	"❌ You don't have any favorite GIFs! Add some by favoriting GIFs in Discord first."

export default plugin({
	start({ cleanup }) {
		let messageUtil: MessageUtil | undefined
		let patchCalls = 0

		// Every module that might hold the favorites. All of them get probed.
		const candidates: any[] = []
		function addCandidate(label: string, mod: any) {
			if (!mod || candidates.includes(mod)) return
			candidates.push(mod)
			dbg(`candidate (${label}) keys:`, protoNames(mod))
		}

		function findFavorites(): GifMap | undefined {
			for (const [i, c] of candidates.entries()) {
				const attempts: Array<[string, () => unknown]> = [
					['.frecencyWithoutFetchingLatest', () => c.frecencyWithoutFetchingLatest],
					['.settings', () => c.settings],
					['.proto', () => c.proto],
					['.getCurrentValue()', () => c.getCurrentValue?.()],
					[
						'.FrecencyUserSettingsActionCreators.getCurrentValue()',
						() => c.FrecencyUserSettingsActionCreators?.getCurrentValue?.(),
					],
					['.favoriteGifs', () => ({ favoriteGifs: c.favoriteGifs })],
					['(module itself)', () => c],
				]

				for (const [name, read] of attempts) {
					try {
						const res = read()
						if (res == null) continue
						const gifs =
							toGifMap((res as any).favoriteGifs?.gifs) ?? deepFindFavorites(res)
						const count = gifs ? Object.keys(gifs).length : 0
						dbg(`candidate #${i} ${name}:`, count ? `${count} favorites` : 'none')
						if (gifs && count > 0) return gifs
					} catch (e) {
						dbg(`candidate #${i} ${name} threw`, e)
					}
				}
			}
			dbg(`no favorites found in any of ${candidates.length} candidates`)
			return undefined
		}

		function getMessage(provider: string): string {
			const gifs = findFavorites()
			if (!gifs) return NoFavorites

			const entries = Object.entries(gifs)

			const byProvider: Record<string, string[]> = {}
			for (const [url, gif] of entries) {
				;(byProvider[classify(url, gif)] ??= []).push(url)
			}
			dbg(
				'provider counts:',
				Object.fromEntries(
					Object.entries(byProvider).map(([p, u]) => [p, u.length]),
				),
			)

			const pool =
				provider === 'all'
					? entries.map(([url]) => url)
					: (byProvider[provider] ?? [])

			dbg(`provider=${provider}, pool size=${pool.length}`)

			if (pool.length === 0) {
				return provider === 'all'
					? NoFavorites
					: `❌ You don't have any favorite ${provider} GIFs.`
			}

			const picked = pool[Math.floor(Math.random() * pool.length)]!
			dbg('picked:', picked, '->', classify(picked, gifs[picked]))
			return picked
		}

		// Dumps everything useful to the debug console without sending anything.
		function dumpDebug() {
			console.log('[gifroulette] ---- DEBUG DUMP ----')
			console.log('[gifroulette] messageUtil found:', !!messageUtil)
			console.log('[gifroulette] candidates:', candidates.length)
			candidates.forEach((c, i) =>
				console.log(`[gifroulette] candidate #${i} keys:`, protoNames(c)),
			)
			console.log('[gifroulette] registered commands:', commands.map(c => c.name))
			console.log('[gifroulette] patch calls so far:', patchCalls)

			const gifs = findFavorites()
			if (gifs) {
				console.log('[gifroulette] favorites total:', Object.keys(gifs).length)
				for (const [url, gif] of Object.entries(gifs).slice(0, 5)) {
					console.log('[gifroulette] sample:', {
						url,
						src: gif?.src,
						format: gif?.format,
						provider: classify(url, gif),
					})
				}
			} else {
				console.log('[gifroulette] no favorites found in any candidate')
			}
			console.log('[gifroulette] ---- END DUMP ----')
		}

		// `readBuiltIns` is getBuiltInCommands captured BEFORE we patch it, and
		// registerCommand runs BEFORE the patch is installed, so this never
		// re-enters our own patch (or another plugin's, e.g. petpet).
		function registerCommand(
			readBuiltIns: GetBuiltInCommands,
			command: ApplicationCommand,
		): () => void {
			let builtInCommands: ApplicationCommand[]
			try {
				builtInCommands = readBuiltIns(
					ApplicationCommandType.CHAT,
					true,
					false,
				)
			} catch (e) {
				dbg('readBuiltIns(CHAT) threw, falling back to all types', e)
				builtInCommands = readBuiltIns(
					Object.values(ApplicationCommandType),
					true,
					false,
				)
			}

			// Sort a copy so Discord's own cached array isn't reordered.
			const sorted = [...(builtInCommands ?? [])].sort(
				(a, b) => parseInt(b.id ?? '0', 10) - parseInt(a.id ?? '0', 10),
			)

			const lastCommand = sorted[sorted.length - 1]
			if (lastCommand?.id)
				command.id = (parseInt(lastCommand.id, 10) - 1).toString()

			command.applicationId ??= '-1'
			command.type ??= ApplicationCommandType.CHAT
			command.inputType = ApplicationCommandInputType.BUILT_IN_TEXT
			command.displayName ??= command.name
			command.untranslatedName ??= command.name
			command.displayDescription ??= command.description
			command.untranslatedDescription ??= command.description

			dbg('registered', {
				name: command.name,
				id: command.id,
				builtInCount: builtInCommands?.length ?? 0,
				lastBuiltInId: lastCommand?.id,
			})

			commands.push(command)

			return () => {
				commands = commands.filter(c => c !== command)
			}
		}

		function patchBuiltInCommands(commandsModule: CommandsModule): () => void {
			// Re-entrancy guard: if another plugin's patch on the same function
			// calls back into this one, return the last result instead of
			// calling `original` again (prevents gifroulette <-> petpet recursion).
			let depth = 0
			let lastResult: ApplicationCommand[] = []

			return instead(
				commandsModule as any,
				'getBuiltInCommands',
				(args: any[], original: (...a: any[]) => any) => {
					if (depth > 0) {
						dbg('re-entrant getBuiltInCommands call, returning cached result')
						return lastResult
					}

					depth++
					try {
						patchCalls++
						const result: ApplicationCommand[] =
							original.apply(commandsModule, args) ?? []

						const type = args[0]
						const wanted: number[] = Array.isArray(type) ? type : [type]

						const ours = commands.filter(
							c =>
								wanted.includes(c.type ?? ApplicationCommandType.CHAT) &&
								!result.includes(c),
						)

						const merged = [...result, ...ours]
						lastResult = merged

						// Only log the first few calls; this runs very often.
						if (patchCalls <= 5) {
							dbg('getBuiltInCommands patched call', {
								call: patchCalls,
								requestedTypes: wanted,
								originalCount: result.length,
								addedCount: ours.length,
							})
						}
						return merged
					} finally {
						depth--
					}
				},
			)
		}

		cleanup(
			getModules(
				withProps<MessageUtil>('sendMessage', 'editMessage'),
				mod => {
					messageUtil = mod
					dbg('found message util')
				},
			),
			getModules(withProps<any>('FrecencyUserSettingsActionCreators'), mod =>
				addCandidate('FrecencyUserSettingsActionCreators', mod),
			),
			getModules(withProps<any>('frecencyWithoutFetchingLatest'), mod =>
				addCandidate('frecencyWithoutFetchingLatest', mod),
			),
			getModules(withProps<any>('favoriteGifs'), mod =>
				addCandidate('favoriteGifs', mod),
			),
			getModules(withProps<CommandsModule>('getBuiltInCommands'), Commands => {
				dbg('found commands module')

				// Capture the unpatched function first, register, THEN patch.
				const readBuiltIns = Commands.getBuiltInCommands.bind(Commands)

				cleanup(
					registerCommand(readBuiltIns, {
						name: 'gifroulette',
						displayName: 'GIF Roulette',
						description: 'Sends a random GIF from your favorites',
						options: [
							{
								name: 'provider',
								displayName: 'provider',
								description:
									'Only pick GIFs from this provider (or "debug" to log diagnostics)',
								displayDescription:
									'Only pick GIFs from this provider (or "debug" to log diagnostics)',
								type: ApplicationCommandOptionType.STRING,
								required: false,
								choices: [...PROVIDER_CHOICES, ...(DEBUG ? ['debug'] : [])].map(
									value => ({ name: value, displayName: value, value }),
								),
							},
						],
						execute: (args, ctx) => {
							try {
								dbg('execute', {
									args,
									channel: ctx?.channel?.id,
									hasMessageUtil: !!messageUtil,
									candidates: candidates.length,
								})

								const provider = String(
									(args as Array<{ name?: string; value?: unknown }> | undefined)
										?.find(a => a?.name === 'provider')?.value ?? 'all',
								)

								if (provider === 'debug') {
									dumpDebug()
									return
								}

								const content = getMessage(provider)

								if (messageUtil) {
									const res = messageUtil.sendMessage(
										ctx.channel.id,
										{ content },
										void 0,
										{ nonce: Date.now().toString() },
									)
									dbg('sendMessage called', res)
									return
								}

								// sendMessage module wasn't found: let Discord send it.
								dbg('no messageUtil, returning { content } instead')
								return { content }
							} catch (e) {
								console.error('[gifroulette] execute threw', e)
							}
						},
					}),
				)
				cleanup(patchBuiltInCommands(Commands))
			}),
			() => {
				commands = []
				candidates.length = 0
				dbg('cleaned up')
			},
		)
	},
})
