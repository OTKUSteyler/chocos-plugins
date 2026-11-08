import Clipboard from '@react-native-clipboard/clipboard'
import { useState } from 'react'
import { Pressable, ScrollView, Switch, Text, View } from 'react-native'
import { fetchRegistry, registrySize, toRegistryEntry } from './registry'
import { hasRealNitro, resetNitroMemo, runtime } from './state'
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
	{ key: 'currentUser', label: 'Current user' },
	{ key: 'typingStore', label: 'Typing store (chat row)' },
]

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
			<Text style={{ color: MUTED }}>{label}</Text>
			<Text style={{ color: 'white' }}>{value}</Text>
		</View>
	)
}

function Button({ text, onPress }: { text: string; onPress(): void }) {
	return (
		<Pressable
			onPress={onPress}
			style={{ padding: 14, borderWidth: 1, borderColor: BORDER, alignItems: 'center' }}
		>
			<Text style={{ color: 'white' }}>{text}</Text>
		</Pressable>
	)
}

export function SettingsComponent(props: TypingSettingsProps) {
	const api = (props as any).api ?? runtime.api
	const storage = api.jsonStorage
	const cfg: ApiOptions['jsonStorage'] = storage.cache
	const [, force] = useState(0)
	const [copied, setCopied] = useState(false)

	const save = async (patch: Partial<ApiOptions['jsonStorage']>) => {
		await storage.set({ ...storage.cache, ...patch })
		resetNitroMemo()
		force(n => n + 1)
	}

	const mine = cfg.mine
	const nitro = hasRealNitro()

	const copyMine = () => {
		if (!mine) return
		const id = runtime.getCurrentUserRaw?.()?.id ?? 'YOUR_USER_ID'
		try {
			Clipboard.setString(JSON.stringify({ [id]: toRegistryEntry(mine) }, null, 2))
			setCopied(true)
		} catch {
			setCopied(false)
		}
	}

	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
			<Text style={{ color: MUTED }}>
				This plugin unlocks Discord's own typing indicator editor and shows other plugin users'
				indicators in chat. With Nitro, Discord's real setting is always used and nothing here
				overrides it.
			</Text>

			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
				<Text style={{ color: 'white', fontSize: 16 }}>Enabled</Text>
				<Switch value={cfg.enabled} onValueChange={enabled => save({ enabled })} />
			</View>

			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
				<View style={{ flex: 1, paddingRight: 12 }}>
					<Text style={{ color: 'white', fontSize: 16 }}>Unlock the editor without Nitro</Text>
					<Text style={{ color: MUTED, fontSize: 12 }}>
						Your style is saved on this device only. Other plugin users see it once it is in the
						registry.
					</Text>
				</View>
				<Switch value={cfg.unlockEditor} onValueChange={unlockEditor => save({ unlockEditor })} />
			</View>

			<View style={{ gap: 6, borderWidth: 1, borderColor: BORDER, padding: 12 }}>
				<Row label="Real Nitro on this account" value={nitro ? 'Yes' : 'No'} />
				<Row label="Registry users loaded" value={String(registrySize())} />
				{PATCHES.map(p => (
					<Row key={p.key} label={p.label} value={runtime.found[p.key] ? 'Found' : 'Not found'} />
				))}
				<Text style={{ color: MUTED, fontSize: 12 }}>
					A patch that says "Not found" means that part of Discord changed. Send me this screen.
				</Text>
			</View>

			<Text style={{ color: 'white', fontSize: 18 }}>My saved indicator</Text>
			<Text style={{ color: MUTED }}>
				{mine
					? `${mine.emojis.length} emoji, suggestion ${mine.typingSuggestion}, animation ${mine.animation}. Edit it in Discord's own typing indicator screen.`
					: 'Nothing saved locally. Open Discord\'s typing indicator screen and press Apply.'}
			</Text>

			{mine ? (
				<>
					<Button text={copied ? 'Copied!' : 'Copy my registry entry'} onPress={copyMine} />
					<Button text="Clear my saved indicator" onPress={() => save({ mine: null })} />
				</>
			) : null}

			<Button
				text="Reload registry"
				onPress={async () => {
					await fetchRegistry()
					force(n => n + 1)
				}}
			/>
		</ScrollView>
	)
}
