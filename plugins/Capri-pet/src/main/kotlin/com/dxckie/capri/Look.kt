package com.dxckie.capri

import android.graphics.Bitmap

/** How Pet.kt sees the character: a frame of an [Anim], its duration and its cell size. */
internal interface Look {
	/** The frame bitmaps' size; the pet view keeps this aspect. */
	val cellW: Int
	val cellH: Int
	/** Cell pixels across that the size setting measures (the character's own width, not the padding). */
	val refW: Float
	val hasMotionPoses: Boolean get() = false
	val timedShake: Boolean get() = false
	/** Share of the cell above the body in an upright pose: room for z's, hearts and a '!'. */
	val headroom: Float get() = 0.12f
	/** The mouth in cell pixels (facing right), when the look knows it; else Pet estimates it. */
	val mouthAt: FloatArray? get() = null

	fun frame(anim: Anim, seconds: Float, still: Int = -1): Bitmap?

	/** How long a one-shot animation takes. */
	fun duration(anim: Anim): Float

	/** Mirrored when facing left. */
	fun directional(anim: Anim): Boolean
}

/** Capri is the only character. */
internal object Looks {
	val current: Look get() = SheetLook.capri
}
