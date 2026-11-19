package com.dxckie.capri

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PointF
import android.graphics.RectF
import android.util.Base64

/** Capri: every animation is a strip of frames cropped to one box, with a little room round it ([PAD_TOP], [PAD_SIDE]) for the things drawn on top: z's, reaction icons, dizzy stars, sparkles. */
internal interface SheetPet {
	val id: String
	val name: String
	val w: Int
	val h: Int
	val strips: Map<String, Pair<Int, Array<String>>>
	val mouth: FloatArray? get() = null
	/** Cell pixels the size setting measures: the whole cell unless the pet's art needs room round it. */
	val refW: Int get() = w
	/** How fast the idle strip plays; the boss pets breathe slowly. */
	val idleFps: Float get() = 8f
}

internal class SheetLook(private val pet: SheetPet) : Look {
	override val cellW = pet.w + PAD_SIDE * 2
	override val cellH = pet.h + PAD_TOP + PAD_BOTTOM
	// A person, not a small animal: measured like a 90 px wide character so the size slider fits.
	override val refW = 90f

	override fun directional(anim: Anim) = true

	val name get() = pet.name
	val idleFps: Float get() = pet.idleFps
	val idleFrameCount: Int get() = pet.strips["idle"]?.first ?: 1

	private val strips = HashMap<String, List<Bitmap>>()
	private val cache = HashMap<String, Bitmap>()

	private fun strip(name: String): List<Bitmap> = strips.getOrPut(name) {
		runCatching {
			val (count, chunks) = pet.strips.getValue(name)
			val bytes = Base64.decode(chunks.joinToString(""), Base64.DEFAULT)
			val sheet = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
			List(count) { i -> Bitmap.createBitmap(sheet, i * pet.w, 0, pet.w, pet.h) }
		}.getOrDefault(emptyList())
	}

	private fun frames(name: String): Pair<String, List<Bitmap>> = name to strip(name)

	private enum class Over { NONE, HEART, ALERT, MAIL, MUSIC }

	/** Which strip, how fast, whether it loops (else holds the last frame), and what goes on top. */
	private class Pick(val strip: String, val fps: Float, val loop: Boolean = true, val over: Over = Over.NONE, val still: Int = -1, val reverse: Boolean = false, val loopFrom: Int = 0)
	/** Looks with their own "outro" strip (Capri's teleport) leave and return in place with it. */
	/** Set while the picker renders preview frames, so a teleporting look shows its bolt in them. */
	@Volatile var preview = false

	val teleports: Boolean get() = pet.strips.containsKey("outro")

	override fun duration(anim: Anim): Float {
		if (anim == Anim.OUTRO || anim == Anim.INTRO) return pet.strips.getValue("outro").first / 24f
		// Her look-around and her blow pose are held frames; these are the lengths they have always had.
		if (anim == Anim.LOOK) return 2.125f
		if (anim == Anim.BLOW) return 2.375f
		val p = choose(anim, -1)
		return if (p.fps <= 0f) 0f else (pet.strips[p.strip]?.first ?: 1) / 24f
	}

	/** Whether this pet has a strip called [name] of its own (not through a fallback). */
	fun has(name: String) = pet.strips.containsKey(name)

	/**
	 * A frame of the strip [name] at [seconds] in, [fps] frames a second, looping or held on the last
	 * frame: her own moves that are not [Anim]s (the spell cast, waking up). Composed like any other frame (padding, outline), nothing drawn on top.
	 */
	fun stripFrame(name: String, seconds: Float, fps: Float, loop: Boolean, loopFrom: Int = 0): Bitmap? = runCatching {
		val (n, list) = frames(name)
		if (list.isEmpty()) return null
		val step = (seconds * fps).toInt()
		val index = if (loopFrom in 1 until list.size) { if (step < loopFrom) step else loopFrom + (step - loopFrom).mod(list.size - loopFrom) } else if (loop) step.mod(list.size) else (seconds * fps).toInt().coerceIn(0, list.size - 1)
		cache.getOrPut("$n:$index:NONE:$outlineColour") { compose(list[index], Over.NONE) }
	}.getOrNull()

	/** The strip, speed and overlay for [anim]. */
	private fun choose(anim: Anim, still: Int): Pick = when (anim) {
		Anim.OUTRO -> Pick("outro", 24f, loop = false)
		Anim.INTRO -> Pick("outro", 24f, loop = false, reverse = true)
		Anim.WALK -> Pick("walk", 24f, loop = false)
		Anim.HAPPY -> Pick("happy", 24f, loopFrom = 6)  // arms thrown up, then she bobs
		Anim.IDLE, Anim.HANG -> Pick("idle", 24f)
		Anim.SLEEP -> Pick("sleep", 24f, loopFrom = 24)  // breaks up once, then her face floats
		Anim.DIZZY -> Pick("dizzy", 8f)
		Anim.SHAKE -> Pick("hurt", 8f, loop = false, over = Over.ALERT)
		Anim.SPIN -> Pick("run", 14f)
		Anim.SURPRISED -> Pick("sit", 0f, over = Over.ALERT)
		Anim.LOOK -> Pick("sit", 0f)
		Anim.REACTION -> Pick("voice", 6f, over = when (still) { 0 -> Over.HEART; 1 -> Over.ALERT; 2 -> Over.MAIL; else -> Over.MUSIC })
		Anim.BLOW -> Pick("voice", 6f)
	}

	override fun frame(anim: Anim, seconds: Float, still: Int): Bitmap? = runCatching {
		val p = choose(anim, still)
		val (name, list) = frames(p.strip)
		if (list.isEmpty()) return null
		// Every one of her strips plays at 24 fps (the still ones, with fps 0, hold their first frame).
		val fps = if (p.fps > 0f) 24f else p.fps
		val index = when {
			fps <= 0f -> 0
			p.loop && p.loopFrom > 0 -> (seconds * fps).toInt().let { if (it < p.loopFrom) it else p.loopFrom + (it - p.loopFrom).mod(list.size - p.loopFrom) }
			p.loop -> (seconds * fps).toInt().mod(list.size)
			else -> (seconds * fps).toInt().coerceIn(0, list.size - 1)
		}.let { if (p.reverse) list.size - 1 - it else it }
		val key = "$name:$index:${p.over}:$outlineColour"
		val base = cache.getOrPut(key) { compose(list[index], p.over) }
		// Her walk and spin strips are blank where the slash goes. Live walk draws it full-screen (BoltView);
		// the picker preview and Spin draw it over her own cell with the same painter.
		val boltF = if (anim == Anim.WALK && preview) index else -1
		if (boltF >= 0) cache.getOrPut("$key:bolt$boltF") { withBolt(base, boltF) } else base
	}.getOrNull()

	private val boltPainters = HashMap<Long, BoltPainter>()

	/** [base] with slash frame [f] over it, in the same style as the live teleport. */
	private fun withBolt(base: Bitmap, f: Int): Bitmap {
		val w = base.width; val h = base.height
		val painter = boltPainters.getOrPut(w.toLong() shl 32 or h.toLong()) {
			val d = w / 300f
			val route = BoltPainter.route(PointF(w * 0.12f, h * 0.7f), PointF(w * 0.88f, h * 0.35f), w.toFloat(), h.toFloat(), d)
			BoltPainter(route, 1f, w * 0.05f, 0.4f)
		}
		val out = base.copy(Bitmap.Config.ARGB_8888, true)
		painter.draw(Canvas(out), w, h, f, f)
		return out
	}

	// ------------------------------------------------------------------------------------------
	// Drawing
	// ------------------------------------------------------------------------------------------

	private val paint = Paint().apply { isAntiAlias = false; isFilterBitmap = false }

	/** The animal's head: the top-right of its box (they face right), in cell pixels. */
	private val headX get() = PAD_SIDE + pet.w - 6
	private val headY = PAD_TOP
	override val mouthAt: FloatArray? get() = null

	private fun compose(sprite: Bitmap, over: Over): Bitmap {
		val out = Bitmap.createBitmap(cellW, cellH, Bitmap.Config.ARGB_8888)
		val c = Canvas(out)
		c.drawBitmap(sprite, PAD_SIDE.toFloat(), PAD_TOP.toFloat(), paint)
		if (outlineColour != 0) outline(out, outlineColour)
		val x = mouthAt?.get(0)?.toInt() ?: headX
		val y = headY - 7
		when (over) {
			Over.NONE -> {}
			Over.HEART -> stamp(c, x - 4, 0, listOf(".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."), 2)
			Over.ALERT -> stamp(c, x - 2, 0, listOf("kyk", "kyk", "kyk", ".k.", "kyk"), 2)
			Over.MAIL -> stamp(c, x - 6, 0, listOf("kkkkkkk", "kwkwkwk", "kwwkwwk", "kwwwwwk", "kkkkkkk"), 2)
			Over.MUSIC -> stamp(c, x - 2, 0, listOf(".www", ".w.w", ".w.w", "ww.w", "wwww"), 2)
		}
		return out
	}

	/**
	 * A one-pixel outline round the animal: every empty pixel that touches a drawn one (up, down,
	 * left or right) takes [colour]. Drawn before the icons and z's, so those stay clean.
	 */
	private fun outline(bmp: Bitmap, colour: Int) {
		val w = bmp.width
		val h = bmp.height
		val px = IntArray(w * h)
		bmp.getPixels(px, 0, w, 0, 0, w, h)
		val solid = BooleanArray(px.size) { (px[it] ushr 24) > 40 }
		for (y in 0 until h) for (x in 0 until w) {
			val i = y * w + x
			if (solid[i]) continue
			val touches = (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) ||
				(y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w])
			if (touches) px[i] = colour
		}
		bmp.setPixels(px, 0, w, 0, 0, w, h)
	}

	/** Draws [rows] as art pixels, each [k] pixels square. */
	private fun stamp(c: Canvas, x: Int, y: Int, rows: List<String>, k: Int = 1) {
		for ((j, row) in rows.withIndex()) for ((i, ch) in row.withIndex()) {
			val colour = COLOURS[ch] ?: continue
			paint.color = colour
			val px = (x + i * k).toFloat()
			val py = (y + j * k).toFloat()
			if (px < 0 || py < 0 || px >= cellW || py >= cellH) continue
			c.drawRect(px, py, px + k, py + k, paint)
		}
	}

	companion object {
		private const val PAD_TOP = 9
		private const val PAD_SIDE = 3
		/** Room under the feet for the outline. */
		private const val PAD_BOTTOM = 1

		/**
		 * The outline's colour (0 = none), set by Pet from Settings.outline and the Discord theme.
		 * Part of every frame's cache key, so a change shows on the next frame.
		 */
		@Volatile var outlineColour = 0
		private val COLOURS = mapOf(
			'w' to 0xFFFFFFFF.toInt(), 'k' to 0xFF2A1E3A.toInt(), 'y' to 0xFFFFDD33.toInt(),
			'r' to 0xFFFF3366.toInt(),
		)

		val capri: SheetLook by lazy { SheetLook(PetData.pets.first { it.id == "capri" }) }
	}
}
