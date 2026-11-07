import { clearData, fetchRegistry } from './data'
import { SettingsComponent } from './settings'
import renderPatches from './patches/render'
import { runtime } from './state'
import type { ApiOptions } from './state'
import type { PluginApi } from '@valenced/plugins/types'

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

		// SettingsComponent is registered by Valenced's plugin system.
		// Do not manually register a Discord settings route: that internal
		// registration path is not a stable public API.


		await fetchRegistry()
		cleanup(() => {
			clearData()
			runtime.api = null
			runtime.currentUserId = null
		})
	},

	SettingsComponent,
})
