package com.dxckie.capri

/**
 * One animation from the sprite set. [directional] ones are drawn facing right and are mirrored
 * when Sparkle faces left; the rest face the viewer (or have a fixed side) and are never flipped.
 */
internal enum class Anim(val strip: String, val fps: Float, val loop: Boolean, val directional: Boolean = false) {
	IDLE("idle", 6f, true),
	WALK("walk_hover", 10f, true, directional = true),
	SPIN("spin", 12f, true),
	/** Dedicated already-inverted ceiling pose for the unicorn and Nyan Cat. */
	HANG("idle", 8f, true),
	HAPPY("happy", 6f, true),
	SLEEP("sleep", 2.5f, true),
	SURPRISED("surprised", 8f, true),
	DIZZY("excited_dizzy", 7f, true),
	/** Four icons, one per bubble: heart, !, mail, music. */
	REACTION("reaction_notification", 0f, false, directional = true),
	SHAKE("shake_burst", 0f, false),
	OUTRO("outro_exit", 8f, false, directional = true),
	/** Coming back on screen; only looks with their own "outro" strip play it (backwards). */
	INTRO("intro", 8f, false, directional = true),
	/**
	 * Blowing: Capri's pose while she possesses the screen (Possess.kt).
	 */
	BLOW("blow", 8f, false, directional = true),
	/** Front, profile, rear pause, then back to idle. Built by tools/build_look.py. */
	LOOK("look", 16f, false),
}

/** Which still of [Anim.REACTION] shows which bubble. */
internal object Bubble {
	const val HEART = 0
	const val ALERT = 1
	const val MAIL = 2
	const val MUSIC = 3
}
