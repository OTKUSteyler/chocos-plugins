// Tracks the most recent touch anywhere on screen so the pet can chase it.
export const touch: { x: number | null; y: number | null; t: number } = {
	x: null,
	y: null,
	t: 0,
}

export function onTouch(e: any) {
	const n = e?.nativeEvent
	if (!n) return
	touch.x = n.pageX ?? n.locationX ?? null
	touch.y = n.pageY ?? n.locationY ?? null
	touch.t = Date.now()
}
