import { clearData, fetchRegistry } from './data'
import { SettingsComponent } from './settings'
import renderPatches from './patches/render'
import { runtime } from './state'
import type { ApiOptions } from './state'
import type { PluginApi } from '@valenced/plugins/types'
import {
	onSettingsModulesLoaded,
	registerSettingsItem,
	registerSettingsSection,
} from '@valenced/discord/modules/settings'

export type { ApiOptions } from './state'

export default plugin<ApiOptions>({
	jsonStorage: {
		load: true,
		default: {
			enabled: true,
			mine: { emojis: [], animation: 'wave', text: 'is typing...' },
			emojiPool: [],
		},
	},

	async start(api: PluginApi<ApiOptions>) {
		const { cleanup } = api
		runtime.api = api
		renderPatches(api)

		// Register a first-party entry in Discord's Settings navigation.
		// This is the supported sidebar/navigation API (not a patch to Discord's
		// channel list, which has no stable public registration API).
		cleanup(
			onSettingsModulesLoaded(() => {
				cleanup(
					registerSettingsSection('CUSTOM_TYPING_INDICATOR', {
						label: 'Custom Typing',
						settings: ['CUSTOM_TYPING_INDICATOR_MAIN'],
					}),
					registerSettingsItem('CUSTOM_TYPING_INDICATOR_MAIN', {
						type: 'route',
						title: () => 'Custom Typing Indicator',
						screen: {
							route: 'CustomTypingIndicatorSettings',
							getComponent: () => SettingsComponent,
						},
					}),
				)
			}),
		)

		await fetchRegistry()
		cleanup(() => {
			clearData()
			runtime.api = null
			runtime.currentUserId = null
		})
	},

	SettingsComponent,
})
