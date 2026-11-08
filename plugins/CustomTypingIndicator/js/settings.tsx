import { useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { describeConfig, hasRealNitro, resetNitroMemo, runtime } from './state'
import type { ApiOptions } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'

export type TypingSettingsProps = ComponentProps<PluginSettingsComponent<ApiOptions>>

const BORDER = '#3a3a4a'
const MUTED = '#b9bbbe'

const PATCHES: { key: keyof typeof runtime.found; label: string }[] = [
	{ key: 'experiment', label: 'Feature flag (canSet / canView)' },
	{ key: 'premium', label: 'Nitro check on the editor' },
	{ key: 'save', label: 'Save interception' },
	{ key: 'currentUser', label: 'User store' },
	{ key: 'devSettings', label: 'Own-indicator preview' },
]

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
			<Text style={{ color: MUTED }}>{label}</Text>
			<Text style={{ color: 'white' }}>{value}</Text>
		</View>
	)
}

function Toggle(props: {
	title: string
	note?: string
	value: boolean
	onChange(value: boolean): void
}) {
	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
			<View style={{ flex: 1, paddingRight: 12 }}>
				<Text style={{ color: 'white', fontSize: 16 }}>{props.title}</Text>
				{props.note ? <Text style={{ color: MUTED, fontSize: 12 }}>{props.note}</Text> : null}
			</View>
			<Switch value={props.value} onValueChange={props.onChange} />
		</View>
	)
}

export function SettingsComponent(props: TypingSettingsProps) {
	const api = (props as any).api ?? runtime.api
	const storage = api.jsonStorage
	const cfg: ApiOptions['jsonStorage'] = storage.cache
	const [, force] = useState(0)

	const save = async (patch: Partial<ApiOptions['jsonStorage']>) => {
		await storage.set({ ...storage.cache, ...patch })
		resetNitroMemo()
		runtime.emitUserChange?.()
		runtime.emitDevChange?.()
		force(n => n + 1)
	}

	const mine = cfg.mine
	const nitro = hasRealNitro()

	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
			<Text style={{ color: MUTED }}>
				Unlocks Discord's own typing indicator editor, and keeps what you save on this device. With
				Nitro, Discord's real setting is always used and nothing here overrides it. Other people
				can't see a style that only exists on this device.
			</Text>

			<Toggle title="Enabled" value={cfg.enabled} onChange={enabled => save({ enabled })} />

			<Toggle
				title="Unlock the editor without Nitro"
				note="Your style is saved on this device only, never sent to Discord."
				value={cfg.unlockEditor}
				onChange={unlockEditor => save({ unlockEditor })}
			/>

			<Toggle
				title="Show my indicator in chat"
				note="Uses Discord's developer preview, so it stays visible in chat instead of only while you type."
				value={cfg.previewOwn}
				onChange={previewOwn => save({ previewOwn })}
			/>

			<View style={{ gap: 6, borderWidth: 1, borderColor: BORDER, padding: 12 }}>
				<Row label="Real Nitro on this account" value={nitro ? 'Yes' : 'No'} />
				{PATCHES.map(p => (
					<Row key={p.key} label={p.label} value={runtime.found[p.key] ? 'Found' : 'Not found'} />
				))}
				<Text style={{ color: MUTED, fontSize: 12 }}>
					"Not found" means that part of Discord changed. Send me this screen.
				</Text>
			</View>

			<Text style={{ color: 'white', fontSize: 18 }}>My saved indicator</Text>
			<Text style={{ color: MUTED }}>
				{mine
					? `${describeConfig(mine)}. Edit it in Discord's own typing indicator screen.`
					: "Nothing saved. Open Discord's typing indicator screen and press Apply."}
			</Text>

			{mine ? (
				<Pressable
					onPress={() => save({ mine: null })}
					style={{ padding: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center' }}
				>
					<Text style={{ color: 'white' }}>Clear my saved indicator</Text>
				</Pressable>
			) : null}
		</ScrollView>
	)
}
