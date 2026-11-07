import { Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native'
import {
	ANIMATIONS,
	DEFAULT_CUSTOM,
	MAX_EMOJIS,
	MAX_TEXT,
	exportConfig,
	sanitize,
	sanitizeCustom,
	surprise,
} from './data'
import type { CustomAnim } from './data'
import TypingStrip from './components/TypingStrip'
import { runtime } from './state'
import type { TypingEntry } from './data'
import type { ApiOptions } from './state'
import type { PluginApi } from '@valenced/plugins/types'

export type TypingSettingsProps = { api: PluginApi<ApiOptions> }

const DEFAULT_MINE: TypingEntry = { emojis: [], animation: 'wave', text: 'is typing...' }

// Every knob of the custom animation. Values are clamped again by sanitizeCustom on save.
const KNOBS: { key: keyof CustomAnim; label: string; step: number; min: number; max: number }[] = [
	{ key: 'moveX', label: 'Move X (px)', step: 1, min: -20, max: 20 },
	{ key: 'moveY', label: 'Move Y (px)', step: 1, min: -20, max: 20 },
	{ key: 'rotate', label: 'Rotate (°)', step: 5, min: -45, max: 45 },
	{ key: 'scale', label: 'Scale', step: 0.1, min: 0.5, max: 2 },
	{ key: 'opacity', label: 'Opacity', step: 0.1, min: 0.2, max: 1 },
	{ key: 'duration', label: 'Speed (ms)', step: 50, min: 100, max: 1500 },
	{ key: 'stagger', label: 'Stagger (ms)', step: 20, min: 0, max: 500 },
	{ key: 'pause', label: 'Pause (ms)', step: 100, min: 0, max: 2000 },
]
const EASINGS: CustomAnim['easing'][] = ['smooth', 'linear', 'bounce']

function Stepper({ label, value, onChange }: { label: string; value: number; onChange(delta: number): void }) {
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
			<Text style={{ color: 'white' }}>{label}</Text>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
				<Pressable onPress={() => onChange(-1)} style={{ padding: 8, borderWidth: 1, borderColor: '#3a3a4a' }}>
					<Text style={{ color: 'white' }}>−</Text>
				</Pressable>
				<Text style={{ color: 'white', minWidth: 44, textAlign: 'center' }}>{Math.round(value * 10) / 10}</Text>
				<Pressable onPress={() => onChange(1)} style={{ padding: 8, borderWidth: 1, borderColor: '#3a3a4a' }}>
					<Text style={{ color: 'white' }}>+</Text>
				</Pressable>
			</View>
		</View>
	)
}

// TODO: swap for the clipboard helper your other plugins use.
async function copy(text: string) {
	await (globalThis as any).navigator?.clipboard?.writeText?.(text)
}

export function SettingsComponent(props: TypingSettingsProps) {
	const api = props.api
	// Valenced settings screens must subscribe through JsonStorage.use();
	// reading .cache alone does not make the screen reactive.
	const cfg = api.jsonStorage.use() as ApiOptions['jsonStorage']
	const storage = api.jsonStorage

	const save = async (patch: Partial<ApiOptions['jsonStorage']>) => {
		await storage.set({ ...cfg, ...patch })
	}
	const setMine = (mine: TypingEntry) => save({ mine: sanitize(mine) ?? { ...DEFAULT_MINE, text: '' }, emojiPool: [...new Set(mine.emojis)].slice(0, MAX_EMOJIS) })

	const mine = cfg.mine

	return (
		<ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
			<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
				<Text style={{ color: 'white', fontSize: 16 }}>Enable custom typing indicators</Text>
				<Switch value={cfg.enabled} onValueChange={enabled => save({ enabled })} />
			</View>


			{/* Preview, same layout as the native screen */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
				<TypingStrip entry={mine} />
				<Text style={{ color: '#b9bbbe' }}>{mine.text || 'is typing...'}</Text>
			</View>

			<Text style={{ color: 'white', fontSize: 18 }}>Emojis</Text>
			<View style={{ flexDirection: 'row', gap: 8 }}>
				{Array.from({ length: MAX_EMOJIS }, (_, i) => (
					<View
						key={i}
						style={{ flex: 1, borderWidth: 1, borderColor: '#3a3a4a', padding: 8, gap: 6 }}
					>
						{mine.emojis[i] ? (
							<Image source={{ uri: mine.emojis[i] }} style={{ width: 36, height: 36, alignSelf: 'center' }} />
						) : null}
						<TextInput
							placeholder="https://…"
							placeholderTextColor="#777"
							autoCapitalize="none"
							defaultValue={mine.emojis[i] ?? ''}
							style={{ color: 'white', fontSize: 11 }}
							onEndEditing={e => {
								const next = [...mine.emojis]
								const url = e.nativeEvent.text.trim()
								if (url) next[i] = url
								else next.splice(i, 1)
								setMine({ ...mine, emojis: next.filter(Boolean) })
							}}
						/>
					</View>
				))}
			</View>

			<Text style={{ color: 'white', fontSize: 18 }}>Animation</Text>
			<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
				{ANIMATIONS.map(a => (
					<Pressable
						key={a}
						onPress={() =>
							setMine({
								...mine,
								animation: a,
								custom: a === 'custom' ? (mine.custom ?? DEFAULT_CUSTOM) : mine.custom,
							})
						}
						style={{
							padding: 10,
							borderWidth: 1,
							borderColor: mine.animation === a ? '#9b7bd8' : '#3a3a4a',
						}}
					>
						<Text style={{ color: 'white', textTransform: 'capitalize' }}>{a}</Text>
					</Pressable>
				))}
			</View>

			{mine.animation === 'custom' && (
				<View style={{ gap: 10, borderWidth: 1, borderColor: '#3a3a4a', padding: 12 }}>
					<Text style={{ color: '#b9bbbe', fontSize: 12 }}>
						Each emoji moves from rest to these values and back. The preview above updates live.
					</Text>
					{KNOBS.map(k => {
						const current = (mine.custom ?? DEFAULT_CUSTOM)[k.key] as number
						return (
							<Stepper
								key={k.key}
								label={k.label}
								value={current}
								onChange={d =>
									setMine({
										...mine,
										custom: sanitizeCustom({
											...(mine.custom ?? DEFAULT_CUSTOM),
											[k.key]: Math.min(k.max, Math.max(k.min, current + d * k.step)),
										}),
									})
								}
							/>
						)
					})}
					<View style={{ flexDirection: 'row', gap: 8 }}>
						{EASINGS.map(e => (
							<Pressable
								key={e}
								onPress={() =>
									setMine({
										...mine,
										custom: sanitizeCustom({ ...(mine.custom ?? DEFAULT_CUSTOM), easing: e }),
									})
								}
								style={{
									padding: 10,
									borderWidth: 1,
									borderColor: (mine.custom ?? DEFAULT_CUSTOM).easing === e ? '#9b7bd8' : '#3a3a4a',
								}}
							>
								<Text style={{ color: 'white', textTransform: 'capitalize' }}>{e}</Text>
							</Pressable>
						))}
					</View>
				</View>
			)}

			<Text style={{ color: 'white', fontSize: 18 }}>Text</Text>
			<TextInput
				maxLength={MAX_TEXT}
				defaultValue={mine.text}
				placeholder="is typing..."
				placeholderTextColor="#777"
				style={{ color: 'white', borderWidth: 1, borderColor: '#3a3a4a', padding: 10 }}
				onEndEditing={e => setMine({ ...mine, text: e.nativeEvent.text })}
			/>

			<Pressable
				onPress={() => setMine(surprise(cfg.emojiPool.length ? cfg.emojiPool : mine.emojis))}
				style={{ padding: 14, borderWidth: 1, borderColor: '#3a3a4a', alignItems: 'center' }}
			>
				<Text style={{ color: 'white' }}>🎲 Surprise Me</Text>
			</Pressable>

			<Pressable
				onPress={() => setMine({ ...DEFAULT_MINE })}
				style={{ padding: 14, borderWidth: 1, borderColor: '#3a3a4a', alignItems: 'center' }}
			>
				<Text style={{ color: 'white' }}>⃠ Reset</Text>
			</Pressable>

			<Pressable
				onPress={() =>
					runtime.currentUserId && copy(exportConfig(runtime.currentUserId, mine))
				}
				style={{ padding: 14, borderWidth: 1, borderColor: '#9b7bd8', alignItems: 'center' }}
			>
				<Text style={{ color: 'white' }}>Copy my config (to share with plugin users)</Text>
			</Pressable>
			<Text style={{ color: '#b9bbbe', fontSize: 12 }}>
				Your own preview is local. Other plugin users see your indicator only when your exported config is added to the shared registry.
			</Text>
		</ScrollView>
	)
}
