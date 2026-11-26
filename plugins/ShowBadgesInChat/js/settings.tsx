import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow } = Design

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Where to show badges">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="AtIcon" />}
							label="Beside pings"
							subLabel="Badges after @mentions in messages."
							value={settings.ping}
							onValueChange={ping => storage.set({ ping })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="UserIcon" />}
							label="Beside usernames"
							subLabel="Badges on a row under the author name in message headers."
							value={settings.username}
							onValueChange={username => storage.set({ username })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Sources">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="AwardIcon" />}
							label="Global Badges"
							subLabel="Also show badges from other client mods."
							value={settings.global}
							onValueChange={global => storage.set({ global })}
						/>
						<TableSwitchRow
							icon={<TableRowAssetIcon name="AwardIcon" />}
							label="Show Global Badges only"
							subLabel="Skip Discord profile badges and show only the ones from other client mods."
							value={settings.globalOnly}
							onValueChange={globalOnly => storage.set({ globalOnly })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
