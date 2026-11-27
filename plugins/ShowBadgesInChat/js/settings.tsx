import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, ScrollView, View } from 'react-native'
import { readLog } from './native'
import { DefaultSettings } from './shared'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Settings } from './shared'

const { Stack, TableRowGroup, TableSwitchRow, Text } = Design

// Sample Discord badges, only for the preview
const Sample = [
	'6bdc42827a38498929a4920da12695d9',
	'7060786766c9c840eb3019e725d2b358',
	'8a88d63823d8a71cd5e390baa45efa02',
].map(icon => `https://cdn.discordapp.com/badge-icons/${icon}.png`)

function Badges() {
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
			{Sample.map(uri => (
				<Image key={uri} source={{ uri }} style={{ width: 18, height: 18 }} />
			))}
		</View>
	)
}

function DebugLog() {
	const [text, setText] = useState('')
	useEffect(() => {
		const read = () => {
			try {
				setText(readLog())
			} catch (e) {
				setText(`could not read native log: ${e}`)
			}
		}
		read()
		const timer = setInterval(read, 1500)
		return () => clearInterval(timer)
	}, [])
	return (
		<Stack spacing={8}>
			<Text variant="text-sm/semibold" color="text-muted">
				Debug log (hold to select and copy)
			</Text>
			<Text variant="text-xs/normal" color="text-normal" selectable>
				{text}
			</Text>
		</Stack>
	)
}

function Preview({ ping, username }: { ping: boolean; username: boolean }) {
	return (
		<Stack spacing={8}>
			<Text variant="text-sm/semibold" color="text-muted">
				Preview
			</Text>
			<View
				style={{
					padding: 12,
					gap: 4,
					borderRadius: 12,
					borderWidth: 1,
					borderColor: 'rgba(128,128,128,0.4)',
				}}
			>
				<Text variant="text-md/semibold" color="text-normal">
					duckie
				</Text>
				{username && <Badges />}
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
					<Text variant="text-md/normal" color="text-normal">
						hey
					</Text>
					<Text variant="text-md/semibold" color="text-link">
						@duckie
					</Text>
					{ping && <Badges />}
				</View>
			</View>
		</Stack>
	)
}

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: Settings }>>

export default function SettingsComponent({
	api: { jsonStorage: storage },
}: Props) {
	const settings = { ...DefaultSettings, ...storage.use() }

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<Preview ping={settings.ping} username={settings.username} />
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
					<TableRowGroup title="Animation">
						<TableSwitchRow
							icon={<TableRowAssetIcon name="AwardIcon" />}
							label="Animate badges"
							subLabel="Play animated badges in message headers and after pings (pings are experimental). Can slow chat down with many of them."
							value={settings.animate}
							onValueChange={animate => storage.set({ animate })}
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
					<DebugLog />
				</Stack>
			</ScrollView>
		</Page>
	)
}
