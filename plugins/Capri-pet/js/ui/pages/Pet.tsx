import { PET } from "../../native"
import { SizeSlider } from "../sizeSlider"
import { FieldRow } from "../fieldGroup"
import { useBottomPadding } from "../safeArea"
import { type PreviewAnimation, update, usePreviewFrames, useSettings } from "../state"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"

/** One frame of an animation sheet: the sheet behind a frame-sized window, moved to that frame. */
function SheetFrame({ anim, frame, hidden, onLoad }: { anim: PreviewAnimation; frame: number; hidden?: boolean; onLoad?: () => void }) {
	const { Image, View, PixelRatio } = ReactNative
	const ratio = PixelRatio.get()
	const w = anim.w / ratio
	const h = anim.h / ratio
	const f = frame % anim.n
	return (
		<View style={{ position: "absolute", width: w, height: h, overflow: "hidden", opacity: hidden ? 0 : 1 }}>
			<Image
				source={{ uri: anim.sheet }}
				onLoad={onLoad}
				fadeDuration={0}
				style={{ position: "absolute", width: w * anim.cols, height: h * Math.ceil(anim.n / anim.cols), left: -(f % anim.cols) * w, top: -Math.floor(f / anim.cols) * h }}
			/>
		</View>
	)
}

/**
 * Her animation, looping, drawn pixel for pixel: native scales the frames by a whole number to
 * fit [size] dp, and they're shown at exactly that size, so nothing smooths the pixel art. Switching
 * pose, the old animation stays up until the new one's image has loaded, then they swap: no blank.
 */
function Sprite({ size, pose = "IDLE", variant = 0 }: { size: number; pose?: string; variant?: number }) {
	const { View, PixelRatio } = ReactNative
	const fresh = usePreviewFrames(pose, variant, Math.round(size * PixelRatio.get()))
	const [shown, setShown] = React.useState<PreviewAnimation | undefined>(fresh)
	const [frame, setFrame] = React.useState(0)
	const waiting = fresh && fresh.sheet !== shown?.sheet ? fresh : undefined
	React.useEffect(() => {
		setFrame(0)
		if (!shown || shown.n < 2) return
		const timer = setInterval(() => setFrame((n: number) => n + 1), 1000 / shown.fps)
		return () => clearInterval(timer)
	}, [shown])
	return (
		<View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
			{shown ? <SheetFrame anim={shown} frame={frame} /> : null}
			{/* The next pose loads out of sight and takes over once its image is ready. */}
			{waiting ? <SheetFrame key={`${pose}:${variant}`} anim={waiting} frame={0} hidden onLoad={() => setShown(waiting)} /> : null}
		</View>
	)
}

const POSES = [
	["IDLE", "Idle"], ["WALK", "Walk"], ["HANG", "Hang"],
	["SPIN", "Spin"], ["HAPPY", "Happy"], ["SLEEP", "Sleep"],
	["SURPRISED", "Surprised"], ["DIZZY", "Dizzy"], ["SHAKE", "Shake"],
	["REACTION", "Reaction"],
	["LOOK", "Look around"], ["OUTRO", "Exit"],
] as const

function AnimationTester() {
	const { View } = ReactNative
	const { Button, TableRow, TableRowGroup } = Design as any
	const [open, setOpen] = React.useState(false)
	const [pose, setPose] = React.useState<string>("SLEEP")
	const [variant, setVariant] = React.useState(0)
	const [replay, setReplay] = React.useState(0)
	return <TableRowGroup title="Animation tester">
		<TableRow label={open ? "Close animation tester" : "Try each animation"}
			subLabel="Loop poses here without waiting for events. Movement and floating effects happen only on the live pet."
			onPress={() => setOpen(!open)} />
		{open ? <View style={{ gap: 12, padding: 16 }}>
			<FieldRow label={`${PET.label} · ${POSES.find(p => p[0] === pose)?.[1]}`}>
				<View style={{ alignItems: "center" }}>
					<Sprite key={`${pose}:${variant}:${replay}`} size={140} pose={pose} variant={variant} />
				</View>
			</FieldRow>
			<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{POSES.map(([id, label]) => <Button key={id} size="md" variant={pose === id ? "primary" : "secondary"}
					text={label} onPress={() => { setPose(id); setVariant(0); setReplay(n => n + 1) }} />)}
			</View>
			{pose === "REACTION" ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{["Heart", "Alert", "Mail", "Music"].map((label, i) =>
					<Button key={i} size="md" variant={variant === i ? "primary" : "secondary"} text={label} onPress={() => setVariant(i)} />)}
			</View> : null}
		</View> : null}
	</TableRowGroup>
}

/** A thin outline so she stands out against busy or dark chats. */
function OutlinePicker({ value }: { value: number }) {
	const { TableRadioGroup, TableRadioRow } = Design as any
	return (
		<TableRadioGroup
			key={`outline-${value}`}
			title="Outline"
			description="A thin border round the pet, so it's easier to see."
			defaultValue={String(value)}
			onChange={(v: string) => update({ outline: Number(v) })}
		>
			<TableRadioRow label="Automatic" subLabel="Light on dark themes, dark on light ones" value="1" />
			<TableRadioRow label="Light" value="2" />
			<TableRadioRow label="Dark" value="3" />
			<TableRadioRow label="Off" value="0" />
		</TableRadioGroup>
	)
}

let nameSave: ReturnType<typeof setTimeout> | undefined

/** The name field: saved once typing pauses (or the field is left), not on every letter. */
function NameField({ value, placeholder }: { value: string; placeholder: string }) {
	const { TextInput } = Design as any
	const [text, setText] = React.useState(value)
	React.useEffect(() => setText(value), [value])
	const save = (next: string) => {
		if (nameSave) clearTimeout(nameSave)
		nameSave = undefined
		if (next !== value) update({ name: next })
	}
	return (
		<FieldRow label="Name" description="What it calls itself in its speech bubbles.">
			<TextInput
				placeholder={placeholder}
				value={text}
				maxLength={24}
				returnKeyType="done"
				onChange={(next: string) => {
					setText(next)
					if (nameSave) clearTimeout(nameSave)
					nameSave = setTimeout(() => save(next), 500)
				}}
				onBlur={() => save(text)}
				onSubmitEditing={() => save(text)}
			/>
		</FieldRow>
	)
}

/** How big, what she's called and her outline; then the tester. */
export default function Pet() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, TableRowGroup } = Design as any

	const s = useSettings()
	const bottom = useBottomPadding()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup>
						<FieldRow label={PET.label}>
							<View style={{ alignItems: "center" }}>
								<Sprite size={140} />
							</View>
						</FieldRow>
					</TableRowGroup>

					<SizeSlider value={s.sizeDp} />

					<TableRowGroup title="Name">
						<NameField value={s.name} placeholder={PET.defaultName} />
					</TableRowGroup>

					<OutlinePicker value={s.outline} />

					<AnimationTester />
				</Stack>
			</ScrollView>
		</Page>
	)
}
