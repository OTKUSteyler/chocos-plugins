import { SIZE, SIZE_STOPS, sizeLabel } from "../native"
import { FieldRow } from "./fieldGroup"
import { update } from "./state"
import { Design } from "@valenced/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"

/** Snaps to Small, Medium or Large when it's within [SIZE.snap] dp of one; anywhere else is fine. */
function snap(dp: number): number {
	const near = SIZE_STOPS.find(s => Math.abs(s.dp - dp) <= SIZE.snap)
	return near ? near.dp : Math.round(dp)
}

let pending: ReturnType<typeof setTimeout> | undefined

/**
 * The size slider. Moves freely, catching on the three stops (marked underneath). The pet only
 * resizes once the thumb rests for a moment, so it doesn't hop about while you drag.
 */
export function SizeSlider({ value }: { value: number }) {
	const { View } = ReactNative
	const { TableRowGroup, Text, Slider } = Design as any
	const [shown, setShown] = React.useState(value)
	React.useEffect(() => setShown(value), [value])
	const onChange = (raw: number) => {
		const dp = snap(raw)
		setShown(dp)
		if (pending) clearTimeout(pending)
		pending = setTimeout(() => update({ sizeDp: dp }), 250)
	}
	const span = SIZE.max - SIZE.min
	return (
		<TableRowGroup title="Size">
			{/* In a real row, so it sits on the row's surface under any theme (design doc §3.6). */}
			<FieldRow label={sizeLabel(shown)}>
				<Slider step={1} value={shown} minimumValue={SIZE.min} maximumValue={SIZE.max} onValueChange={onChange} />
				<View style={{ height: 16 }}>
					{SIZE_STOPS.map(stop => (
						<Text
							key={stop.label}
							variant="text-xs/normal"
							color={stop.dp === shown ? "text-default" : "text-muted"}
							style={{ position: "absolute", left: `${((stop.dp - SIZE.min) / span) * 100}%`, transform: [{ translateX: -24 }], width: 48, textAlign: "center" }}
						>
							{stop.label}
						</Text>
					))}
				</View>
			</FieldRow>
		</TableRowGroup>
	)
}
