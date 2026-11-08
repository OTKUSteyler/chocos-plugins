import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { hasRealNitro, isEnabled, resetNitroMemo, runtime, settings } from '../state'
import type { TypingConfig, TypingPluginApi } from '../state'

// Every finder below uses a property name taken from the Discord 351.11 decompilation:
//   modules/custom_typing_indicator/CustomTypingIndicatorExperiment.tsx
//   utils/PremiumUtils.tsx
//   actions/UserSettingsAccountActionCreators.tsx
//   stores/UserStore.tsx

export default function unlockPatches(api: TypingPluginApi) {
	const { cleanup } = api

	cleanup(
		// 1) The feature sits behind the server-side experiment "2026-07-custom-typing-indicator"
		//    ({ canSet, canView, entryPoint }). Both the editor and the chat row check it.
		//    The original is always called first, so React's hook order never changes.
		getModules(withProps<any>('useCustomTypingIndicatorConfig'), mod => {
			runtime.found.experiment = true
			for (const key of ['useCustomTypingIndicatorConfig', 'getCustomTypingIndicatorConfig']) {
				if (typeof mod[key] !== 'function') continue
				cleanup(
					instead(mod, key, (args: any[], original: (...a: any[]) => any) => {
						const result = Reflect.apply(original, mod, args)
						if (!isEnabled()) return result
						return {
							...result,
							canSet: true,
							canView: true,
							entryPoint: result?.entryPoint ?? 'settings',
						}
					}),
				)
			}
		}),

		// 2) The editor shows "Get Nitro" when this says no. Discord's real answer is kept so
		//    the plugin always knows whether the account genuinely has Nitro.
		getModules(withProps<any>('canUsePremiumProfileCustomization'), mod => {
			runtime.found.premium = true
			runtime.canActuallyUse = mod.canUsePremiumProfileCustomization.bind(mod)
			resetNitroMemo()
			cleanup(
				instead(
					mod,
					'canUsePremiumProfileCustomization',
					(args: any[], original: (...a: any[]) => any) => {
						if (settings()?.enabled && settings()?.unlockEditor) return true
						return Reflect.apply(original, mod, args)
					},
				),
			)
		}),

		// 3) Apply in the editor calls saveProfileAndAccountChanges({ typingIndicatorStyle }) and
		//    only checks `.ok`. Without real Nitro the server would refuse, so the style is kept
		//    locally instead. With Nitro this passes straight through to Discord.
		getModules(withProps<any>('saveProfileAndAccountChanges'), mod => {
			runtime.found.save = true
			cleanup(
				instead(
					mod,
					'saveProfileAndAccountChanges',
					(args: any[], original: (...a: any[]) => any) => {
						const payload = args[0]
						const current = settings()
						if (
							!current?.enabled ||
							!payload ||
							payload.typingIndicatorStyle === undefined ||
							hasRealNitro()
						) {
							return Reflect.apply(original, mod, args)
						}

						const { typingIndicatorStyle, ...rest } = payload
						const mine: TypingConfig | null = typingIndicatorStyle ?? null
						void api.jsonStorage.set({ ...current, mine })
						runtime.emitUserChange?.()

						// Anything else in the same save (not the case for this screen) still goes through.
						const others = Object.values(rest).some(value => value !== undefined)
						if (others) return Reflect.apply(original, mod, [rest, ...args.slice(1)])
						return Promise.resolve({ ok: true })
					},
				),
			)
		}),

		// 4) The editor and the "preview own indicator" dev setting read the current user's
		//    `typingIndicatorStyle`. When the account has no style of its own (and no Nitro),
		//    the locally saved one is filled in so the editor shows what you saved.
		getModules(withProps<any>('getCurrentUser', 'getUser', 'getUsers'), store => {
			runtime.found.currentUser = true
			runtime.getCurrentUserRaw = store.getCurrentUser.bind(store)
			runtime.emitUserChange =
				typeof store.emitChange === 'function' ? () => store.emitChange() : null
			resetNitroMemo()

			cleanup(
				instead(store, 'getCurrentUser', (args: any[], original: (...a: any[]) => any) => {
					const user = Reflect.apply(original, store, args)
					const mine = settings()?.mine
					if (user && mine && isEnabled() && user.typingIndicatorStyle == null && !hasRealNitro()) {
						try {
							user.typingIndicatorStyle = mine
						} catch {
							// A frozen record just means the editor starts empty.
						}
					}
					return user
				}),
			)
		}),
	)
}
