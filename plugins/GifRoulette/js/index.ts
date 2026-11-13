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
	channel?: { id?: string }
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

interface FrecencyStore {
	favoriteGifs?: { gifs?: Record<string, unknown> }
}

interface FrecencySettingsModule {
	FrecencyUserSettingsActionCreators?: {
		getCurrentValue?: () => FrecencyStore | undefined
		loadIfNecessary?: () => Promise<unknown> | unknown
	}
}

let commands: ApplicationCommand[] = []

const NoFavorites =
	"❌ You don't have any favorite GIFs! Add some by favoriting GIFs in Discord first."

export default plugin({
	start({ cleanup }) {
		let messageUtil: MessageUtil | undefined
		let frecency: FrecencySettingsModule | undefined

		async function getMessage(): Promise<string> {
			const creators = frecency?.FrecencyUserSettingsActionCreators

			// The favorites store can be lazy-loaded. Load it before reading it.
			try {
				await creators?.loadIfNecessary?.()
			} catch (error) {
				console.error('[gifroulette] Failed to load favorite GIFs:', error)
			}

			const store = creators?.getCurrentValue?.()
			const gifs = store?.favoriteGifs?.gifs
			if (!gifs || typeof gifs !== 'object') return NoFavorites

			const urls = Object.keys(gifs).filter(url => typeof url === 'string' && url.length > 0)
			if (urls.length === 0) return NoFavorites

			return urls[Math.floor(Math.random() * urls.length)]!
		}

		function registerCommand(
			readBuiltIns: GetBuiltInCommands,
			command: ApplicationCommand,
		): () => void {
			let builtInCommands: ApplicationCommand[]
			try {
				// Discord expects an array of command types in this argument.
				builtInCommands = readBuiltIns(
					[ApplicationCommandType.CHAT],
					true,
					false,
				)
			} catch (error) {
				console.warn('[gifroulette] Could not read CHAT commands; trying all types:', error)
				builtInCommands = readBuiltIns(
					Object.values(ApplicationCommandType),
					true,
					false,
				)
			}

			// Sort a copy so Discord's cached command array is not mutated.
			const sorted = [...(builtInCommands ?? [])].sort(
				(a, b) => parseInt(b.id ?? '0', 10) - parseInt(a.id ?? '0', 10),
			)

			const lastCommand = sorted[sorted.length - 1]
			if (lastCommand?.id) {
				const lastId = parseInt(lastCommand.id, 10)
				if (Number.isFinite(lastId)) command.id = (lastId - 1).toString()
			}

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

						const ours = commands.filter(
							command =>
								wanted.includes(command.type ?? ApplicationCommandType.CHAT) &&
								!result.includes(command),
						)

						lastResult = [...result, ...ours]
						return lastResult
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
			getModules(withProps<CommandsModule>('getBuiltInCommands'), Commands => {
				// Capture the original before installing our patch.
				const readBuiltIns = Commands.getBuiltInCommands.bind(Commands)

				cleanup(
					registerCommand(readBuiltIns, {
						name: 'gifroulette',
						displayName: 'GIF Roulette',
						description: 'Sends a random GIF from your favorites',
						options: [],
						execute: async (_args, ctx) => {
							try {
								const channelId = ctx?.channel?.id
								if (!channelId) {
									console.error('[gifroulette] Command context did not contain a channel ID.')
									return { content: '❌ Could not determine the current channel.' }
								}

								const content = await getMessage()

								// Prefer the direct message utility when it is available.
								// Return the payload as a fallback so the built-in command
								// handler can send it if the utility has not been discovered.
								if (messageUtil?.sendMessage) {
									messageUtil.sendMessage(
										channelId,
										{ content },
										undefined,
										{ nonce: Date.now().toString() },
									)
									return
								}

								console.warn('[gifroulette] sendMessage module unavailable; returning command payload.')
								return { content }
							} catch (error) {
								console.error('[gifroulette] Command execution failed:', error)
								return { content: '❌ GIF Roulette failed. Check the plugin logs for details.' }
							}
						},
					}),
				)

				cleanup(patchBuiltInCommands(Commands))
			}),
			() => {
				commands = []
				messageUtil = undefined
				frecency = undefined
			},
		)
	},
})
