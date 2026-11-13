import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

const CHAT = 1
const BUILT_IN_TEXT = 1
const NO_FAVORITES =
	"❌ You don't have any favorite GIFs! Add some by favoriting GIFs in Discord first."

interface Command {
	id?: string
	name: string
	displayName?: string
	untranslatedName?: string
	description: string
	displayDescription?: string
	untranslatedDescription?: string
	options: unknown[]
	execute(args: unknown[], ctx: { channel?: { id?: string } }): unknown
	applicationId?: string
	inputType?: number
	type?: number
}

interface CommandsModule {
	getBuiltInCommands(type: number | number[], ...rest: unknown[]): Command[]
}

interface FrecencyStore {
	favoriteGifs?: { gifs?: Record<string, unknown> }
}

interface FrecencyModule {
	FrecencyUserSettingsActionCreators?: {
		getCurrentValue?: () => FrecencyStore | undefined
		loadIfNecessary?: () => Promise<unknown> | unknown
	}
}

interface ProtoStore {
	frecencyWithoutFetchingLatest?: FrecencyStore
	settings?: { frecency?: FrecencyStore }
}

let commands: Command[] = []

export default plugin({
	start({ cleanup }) {
		let frecency: FrecencyModule | undefined
		let protoStore: ProtoStore | undefined

		async function randomFavorite(): Promise<string> {
			const creators = frecency?.FrecencyUserSettingsActionCreators
			try {
				await creators?.loadIfNecessary?.()
			} catch (error) {
				console.error('[gifroulette] Failed to load favorite GIFs:', error)
			}

			const store =
				creators?.getCurrentValue?.() ??
				protoStore?.frecencyWithoutFetchingLatest ??
				protoStore?.settings?.frecency
			const urls = Object.keys(store?.favoriteGifs?.gifs ?? {}).filter(Boolean)
			if (urls.length === 0) return NO_FAVORITES

			return urls[Math.floor(Math.random() * urls.length)]!
		}

		function registerCommand(
			readBuiltIns: CommandsModule['getBuiltInCommands'],
			command: Command,
		): () => void {
			// Give the command an id just below the lowest built-in one.
			const ids = (readBuiltIns([CHAT], true, false) ?? [])
				.map(c => parseInt(c.id ?? '', 10))
				.filter(Number.isFinite)
			command.id = ids.length ? (Math.min(...ids) - 1).toString() : '-1'

			command.applicationId ??= '-1'
			command.type ??= CHAT
			command.inputType = BUILT_IN_TEXT
			command.displayName ??= command.name
			command.untranslatedName ??= command.name
			command.displayDescription ??= command.description
			command.untranslatedDescription ??= command.description

			commands.push(command)
			return () => {
				commands = commands.filter(c => c !== command)
			}
		}

		function patchBuiltIns(module: CommandsModule): () => void {
			let reentrant = false
			let last: Command[] = []

			return instead(
				module as any,
				'getBuiltInCommands',
				(args: any[], original: (...a: any[]) => any) => {
					if (reentrant) return last

					reentrant = true
					try {
						const result: Command[] = original.apply(module, args) ?? []
						const wanted: number[] = Array.isArray(args[0]) ? args[0] : [args[0]]
						const ours = commands.filter(
							c => wanted.includes(c.type ?? CHAT) && !result.includes(c),
						)
						last = [...result, ...ours]
						return last
					} finally {
						reentrant = false
					}
				},
			)
		}

		cleanup(
			getModules(
				withProps<FrecencyModule>('FrecencyUserSettingsActionCreators'),
				mod => {
					frecency = mod
				},
			),
			getModules(
				withProps<ProtoStore>('frecencyWithoutFetchingLatest'),
				mod => {
					protoStore = mod
				},
			),
			getModules(withProps<CommandsModule>('getBuiltInCommands'), module => {
				const readBuiltIns = module.getBuiltInCommands.bind(module)

				cleanup(
					registerCommand(readBuiltIns, {
						name: 'gifroulette',
						displayName: 'GIF Roulette',
						description: 'Sends a random GIF from your favorites',
						options: [],
						// Returning the payload lets Discord's command handler send it.
						execute: async () => {
							try {
								return { content: await randomFavorite() }
							} catch (error) {
								console.error('[gifroulette] Command failed:', error)
								return { content: '❌ GIF Roulette failed.' }
							}
						},
					}),
					patchBuiltIns(module),
				)
			}),
			() => {
				commands = []
				frecency = undefined
				protoStore = undefined
			},
		)
	},
})
