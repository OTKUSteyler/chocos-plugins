import { FieldRow } from "../fieldGroup"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { update, useSettings } from "../state"
import * as components from "@valenced/components"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

/**
 * Still, then the four activity levels. Still is "Wanders on its own" off (it used to be its own
 * switch); the others are `activity` 0..3 with wandering on. Native keeps both settings as they were.
 */
const STEPS = [
	{ label: "Still", about: "Stays where you put it. It still naps, reacts and can be carried or thrown." },
	{ label: "Calm", about: "Mostly sits about: a short walk now and then. Naps for 3 to 6 minutes." },
	{ label: "Normal", about: "Potters about, sometimes strolls across the screen. Naps for 1½ to 3 minutes." },
	{ label: "Lively", about: "Always on the move, often at a trot. Naps for 1 to 2 minutes." },
	{ label: "Hyper", about: "Hardly stands still. Naps for under a minute." },
]

function ActivitySlider({ wander, activity }: { wander: boolean; activity: number }) {
	const { View } = ReactNative
	const { TableRowGroup, Text, Slider } = Design as any
	const step = wander ? Math.min(3, Math.max(0, activity)) + 1 : 0
	return (
		<TableRowGroup title="Activity">
			<FieldRow label={STEPS[step].label}>
				<Text color="text-muted" variant="text-sm/normal">
					{STEPS[step].about}
				</Text>
				<Slider
					step={1}
					value={step}
					minimumValue={0}
					maximumValue={4}
					onValueChange={(raw: number) => {
						const next = Math.round(raw)
						if (next === step) return
						update(next === 0 ? { wander: false } : { wander: true, activity: next - 1 })
					}}
				/>
				<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
					{STEPS.map((s, i) => (
						<Text
							key={s.label}
							color={i === step ? "text-default" : "text-muted"}
							variant={i === step ? "text-xs/semibold" : "text-xs/normal"}
						>
							{s.label}
						</Text>
					))}
				</View>
			</FieldRow>
		</TableRowGroup>
	)
}

/** How it moves: activity first, then gravity, talking and vibration, when it shows up, and naps. */
export default function Movement() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any

	const s = useSettings()
	const bottom = useBottomPadding()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<ActivitySlider wander={s.wander} activity={s.activity} />

					<TableRowGroup title="Moving around" hasIcons>
						<TableSwitchRow
							label="Gravity"
							subLabel="Falls to the bottom of the screen and slides when you tilt the phone. Tip the top down and it floats up. Off: it floats, and roams up and down the screen as well as sideways."
							icon={rowIcon("ArrowSmallDownIcon", "DownloadIcon")}
							value={s.gravity}
							onValueChange={(gravity: boolean) => update({ gravity })}
						/>
						<TableSwitchRow
							label="Talks"
							subLabel="Speech bubbles now and then."
							icon={rowIcon("ChatIcon", "ic_message")}
							value={s.talks}
							onValueChange={(talks: boolean) => update({ talks })}
						/>
						<TableSwitchRow
							label="Vibration"
							subLabel="A little buzz when you tap, pet or throw it."
							icon={rowIcon("MobilePhoneIcon", "PhoneIcon")}
							value={s.haptics}
							onValueChange={(haptics: boolean) => update({ haptics })}
						/>
					</TableRowGroup>

					<TableRadioGroup
						key={`when-${s.showWhen}`}
						title="Shows up"
						description="While typing: it hides until the keyboard comes up, pops in on top of it, and leaves a few seconds after you're done."
						defaultValue={String(s.showWhen)}
						onChange={(value: string) => update({ showWhen: Number(value) })}
					>
						<TableRadioRow label="All the time" value="0" />
						<TableRadioRow label="Only while typing" value="1" />
					</TableRadioGroup>

					<TableRadioGroup
						key={`sleep-${s.sleepAfter}`}
						title="Falls asleep"
						description="When nobody has touched it for a while, it takes a nap and wakes up by itself (Activity sets how long). Tap it to wake it sooner."
						defaultValue={String(s.sleepAfter)}
						onChange={(value: string) => update({ sleepAfter: Number(value) })}
					>
						<TableRadioRow label="After 30 seconds" value="4" />
						<TableRadioRow label="After 1 minute" value="0" />
						<TableRadioRow label="After 3 minutes" value="1" />
						<TableRadioRow label="After 10 minutes" value="2" />
						<TableRadioRow label="Never" value="3" />
					</TableRadioGroup>

				</Stack>
			</ScrollView>
		</Page>
	)
}
