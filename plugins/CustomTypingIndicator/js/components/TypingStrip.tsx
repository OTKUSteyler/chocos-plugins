import { useEffect, useRef } from 'react'
import { Animated, Easing, Image, View } from 'react-native'
import { DEFAULT_CUSTOM } from '../data'
import type { CustomAnim, TypingEntry } from '../data'

const SIZE = 18

// The built-in animations are just presets of the same parameters the custom one exposes.
const PRESETS: Record<'wave' | 'bounce' | 'pulse', CustomAnim> = {
	wave: { ...DEFAULT_CUSTOM, moveY: -3 },
	bounce: { ...DEFAULT_CUSTOM, moveY: -6, easing: 'bounce' },
	pulse: { ...DEFAULT_CUSTOM, moveY: 0, scale: 1.25, stagger: 0 },
}

function resolve(entry: TypingEntry): CustomAnim | null {
	if (entry.animation === 'none') return null
	if (entry.animation === 'custom') return entry.custom ?? DEFAULT_CUSTOM
	return PRESETS[entry.animation]
}

// NOTE for the Valenced build: it rewrites every identifier named like an import
// (View, Image, ...) into `valenced.react.ReactNative.X`, so `<Animated.View>` becomes
// `...Animated.valenced.react.ReactNative.View` and crashes. A top-level alias is the
// supported workaround. Also keep react-native values out of top-level objects: they
// would be evaluated at module load, so Easing is looked up lazily in a function.
const AnimatedView = Animated.View

function easingFor(name: CustomAnim['easing']) {
	if (name === 'linear') return Easing.linear
	if (name === 'bounce') return Easing.bounce
	return Easing.inOut(Easing.quad)
}

function Emoji({ uri, index, anim }: { uri: string; index: number; anim: CustomAnim | null }) {
	const v = useRef(new Animated.Value(0)).current

	useEffect(() => {
		if (!anim) return
		const easing = easingFor(anim.easing)
		const loop = Animated.loop(
			Animated.sequence([
				Animated.delay(index * anim.stagger),
				Animated.timing(v, { toValue: 1, duration: anim.duration, easing, useNativeDriver: true }),
				Animated.timing(v, { toValue: 0, duration: anim.duration, easing, useNativeDriver: true }),
				Animated.delay(anim.pause),
			]),
		)
		loop.start()
		return () => loop.stop()
		// Restart when any parameter changes (live preview while editing).
	}, [index, v, JSON.stringify(anim)])

	const to = (a: number, b: number) => v.interpolate({ inputRange: [0, 1], outputRange: [a, b] })

	const style = anim
		? {
				opacity: to(1, anim.opacity),
				transform: [
					{ translateX: to(0, anim.moveX) },
					{ translateY: to(0, anim.moveY) },
					{ scale: to(1, anim.scale) },
					{ rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${anim.rotate}deg`] }) },
				],
			}
		: {}

	return (
		<AnimatedView style={style}>
			<Image source={{ uri }} style={{ width: SIZE, height: SIZE, marginRight: 3 }} />
		</AnimatedView>
	)
}

export default function TypingStrip({ entry }: { entry: TypingEntry }) {
	if (!entry.emojis.length) return null
	const anim = resolve(entry)
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
			{entry.emojis.map((uri, i) => (
				<Emoji key={`${i}:${uri}`} uri={uri} index={i} anim={anim} />
			))}
		</View>
	)
}
