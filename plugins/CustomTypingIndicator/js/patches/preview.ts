import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { hasRealNitro, runtime, settings } from '../state'
import type { TypingPluginApi } from '../state'

// modules/devtools/dev_settings/DevSettingsStore.tsx defines the developer setting
//   preview_own_typing_indicator: "always show the chat typing indicator as if you were typing"
// modules/chat/native/TypingIndicator.tsx then draws the row for your own account and reads
// your style from UserStore.getUser(yourId).typingIndicatorStyle.
//
// Discord removes your own ID from the typing list on purpose, so this preview is the only
// way to see your own indicator. It stays visible instead of only while you type.
export default function previewPatches(api: TypingPluginApi) {
	const { cleanup } = api

	cleanup(
		getModules(withProps<any>('get', 'enabled', 'allByCategory'), store => {
			runtime.found.devSettings = true
			runtime.emitDevChange = typeof store.emitChange === 'function' ? () => store.emitChange() : null
			cleanup(
				instead(store, 'get', (args: any[], original: (...a: any[]) => any) => {
					const current = settings()
					if (
						args[0] === 'preview_own_typing_indicator' &&
						current?.enabled &&
						current.previewOwn &&
						current.mine &&
						!hasRealNitro()
					) {
						return true
					}
					return Reflect.apply(original, store, args)
				}),
			)
		}),
	)
}
