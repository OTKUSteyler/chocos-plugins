import { FieldRow } from "./fieldGroup"
import { Design } from "@valenced/discord/design"
import * as ReactNative from "react-native"

const LEVELS = ["Off", "Rare", "Sometimes", "Often", "Very often"] as const
/** Native's rateScale: Rare, Sometimes (the original timing), Often, Very often. */
const SCALE = [0, 2.5, 1, 0.4, 0.15]

function duration(seconds: number): string {
	if (seconds < 90) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`
	const minutes = seconds / 60
	return minutes < 90 ? `${Math.round(minutes)} min` : `${Math.round(minutes / 6) / 10} h`
}

/**
 * A "how often" slider for something that happens now and then: Off, then four rates. Off is the
 * feature's own switch (which Quick Toggles also flips), the rest set its rate (1-4) and switch it on.
 * [minSeconds]-[maxSeconds] is the wait at Sometimes, shown scaled for the chosen stop.
 */
export function RateSlider({
	title,
	description,
	on,
	rate,
	minSeconds,
	maxSeconds,
	disabled,
	onChange,
}: {
	title: string
	description: string
	on: boolean
	rate: number
	minSeconds: number
	maxSeconds: number
	disabled?: boolean
	onChange: (on: boolean, rate: number) => void
}) {
	const { View } = ReactNative
	const { Text, TableRowGroup, Slider } = Design as any

	const level = on ? Math.min(4, Math.max(1, rate)) : 0
	const scale = SCALE[level]
	const when = level === 0 ? "Off." : `About every ${duration(minSeconds * scale)} to ${duration(maxSeconds * scale)}.`

	return (
		<TableRowGroup>
			<FieldRow label={`${title} — ${LEVELS[level]}`}>
				<View style={{ gap: 8, opacity: disabled ? 0.5 : 1 }}>
				<Text color="text-muted" variant="text-sm/normal">
					{description} {when}
				</Text>
				<Slider
					step={1}
					value={level}
					minimumValue={0}
					maximumValue={4}
					disabled={disabled}
					onValueChange={(v: number) => {
						const next = Math.round(v)
						if (next === level) return
						onChange(next > 0, next > 0 ? next : rate)
					}}
				/>
				<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
					{LEVELS.map((label, i) => (
						<Text
							key={label}
							color={i === level ? "text-default" : "text-muted"}
							variant={i === level ? "text-xs/semibold" : "text-xs/normal"}
						>
							{label}
						</Text>
					))}
				</View>
				</View>
			</FieldRow>
		</TableRowGroup>
	)
}
