import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

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

interface CommandContext {
	channel: { id: string }
}

interface ApplicationCommandOption {
	name: string
	description: string
	displayName?: string
	displayDescription?: string
	type: number
	required?: boolean
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

type FavoriteGifs = { favoriteGifs?: { gifs?: Record<string, unknown> } }

interface FrecencySettingsModule {
	FrecencyUserSettingsActionCreators?: {
		getCurrentValue?: () => FavoriteGifs
	}
}

interface ProtoStore {
	frecencyWithoutFetchingLatest?: FavoriteGifs
	settings?: FavoriteGifs
}

let commands: ApplicationCommand[] = []

const NoFavorites =
	"❌ You don't have any favorite GIFs! Add some by favoriting GIFs in Discord first."

export default plugin({
	start({ cleanup }) {
		let messageUtil: MessageUtil | undefined
		let frecency: FrecencySettingsModule | undefined
		let proto: ProtoStore | undefined

		function findFavorites(): Record<string, unknown> | undefined {
			let fromActionCreators: Record<string, unknown> | undefined
			try {
				fromActionCreators =
					frecency?.FrecencyUserSettingsActionCreators?.getCurrentValue?.()
						?.favoriteGifs?.gifs
			} catch {}

			return (
				proto?.frecencyWithoutFetchingLatest?.favoriteGifs?.gifs ??
				fromActionCreators ??
				proto?.settings?.favoriteGifs?.gifs
			)
		}

		function getMessage(): string {
			const gifs = findFavorites()
			console.log('[gifroulette] favorites lookup', {
				hasProto: !!proto,
				protoKeys: proto ? Object.keys(proto).slice(0, 15) : [],
				hasFrecency: !!frecency,
				count: gifs ? Object.keys(gifs).length : 0,
			})
			if (!gifs) return NoFavorites

			const urls = Object.keys(gifs)
			if (urls.length === 0) return NoFavorites

			return urls[Math.floor(Math.random() * urls.length)]!
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
			} catch {
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
					if (depth > 0) return lastResult

					depth++
					try {
						const result: ApplicationCommand[] =
							original.apply(commandsModule, args) ?? []

						const type = args[0]
						const wanted: number[] = Array.isArray(type) ? type : [type]

						const merged = [
							...result,
							...commands.filter(
								c =>
									wanted.includes(c.type ?? ApplicationCommandType.CHAT) &&
									!result.includes(c),
							),
						]
						lastResult = merged
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
				},
			),
			getModules(
				withProps<FrecencySettingsModule>('FrecencyUserSettingsActionCreators'),
				mod => {
					frecency = mod
				},
			),
			getModules(
				withProps<ProtoStore>('frecencyWithoutFetchingLatest'),
				mod => {
					proto = mod
				},
			),
			getModules(withProps<CommandsModule>('getBuiltInCommands'), Commands => {
				// Capture the unpatched function first, register, THEN patch.
				const readBuiltIns = Commands.getBuiltInCommands.bind(Commands)

				cleanup(
					registerCommand(readBuiltIns, {
						name: 'gifroulette',
						displayName: 'GIF Roulette',
						description: 'Sends a random GIF from your favorites',
						options: [],
						execute: (_args, ctx) => {
							const content = getMessage()
							console.log('[gifroulette] execute', ctx?.channel?.id, content)

							if (messageUtil) {
								messageUtil.sendMessage(
									ctx.channel.id,
									{ content },
									void 0,
									{ nonce: Date.now().toString() },
								)
								return
							}

							// sendMessage module wasn't found: let Discord send it.
							return { content }
						},
					}),
				)
				cleanup(patchBuiltInCommands(Commands))
			}),
			() => {
				commands = []
			},
		)
	},
})
