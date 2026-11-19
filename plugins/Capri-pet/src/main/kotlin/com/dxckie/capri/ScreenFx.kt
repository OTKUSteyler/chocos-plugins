package com.dxckie.capri

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * Full-screen reaction effects: one of Shimeji's own per message reaction (js/lib/moods.ts), drawn
 * across the whole screen in the pet's pixel style for a few seconds. Hearts rise for Love, confetti
 * falls for Celebrate, rain for Sad, and so on.
 *
 * The view sits just behind the pet and never takes a touch. One at a time, at most one every
 * [GAP_SECONDS], so a busy channel doesn't strobe. Everything is worked out from each particle's
 * age, so there is no physics state to step. Main thread only.
 */
internal object ScreenFx {
	private const val GAP_SECONDS = 6f
	private var view: FxView? = null
	private var lastStart = -100f

	val kinds = setOf("love", "laugh", "hi", "bye", "sleepy", "sad", "wow", "party", "cool", "food", "music", "thanks")

	private fun now() = SystemClock.uptimeMillis() / 1000f

	/** Plays [kind] on [root], just under [pet]. [ox], [oy]: the pet's centre, for effects that start there. */
	fun play(root: ViewGroup, pet: View?, kind: String, ox: Float, oy: Float, force: Boolean = false) {
		if (kind !in kinds) return
		val t = now()
		if (view != null) {
			if (!force) return
			cancel()
		}
		if (!force && t - lastStart < GAP_SECONDS) return
		lastStart = t
		val v = FxView(root.context, kind, ox, oy) { cancel() }
		val index = pet?.let { root.indexOfChild(it) }?.takeIf { it >= 0 } ?: root.childCount
		root.addView(v, index, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
		view = v
	}

	fun cancel() {
		view?.let { (it.parent as? ViewGroup)?.removeView(it) }
		view = null
	}

	private class P(
		val x: Float, val y: Float, val vx: Float, val vy: Float,
		val size: Float, val color: Int, val phase: Float, val delay: Float, val spin: Float,
	)

	private class FxView(context: Context, val kind: String, val ox: Float, val oy: Float, val done: () -> Unit) : View(context) {
		private val start = now()
		private val duration = when (kind) { "sleepy", "sad" -> 3.4f; "wow" -> 1.6f; else -> 3f }
		private val px = dp(3f)
		private val paint = Paint().apply { isAntiAlias = false; isFilterBitmap = false }
		private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
			typeface = ggSans(context) ?: Typeface.DEFAULT_BOLD
			isFakeBoldText = true
			textAlign = Paint.Align.CENTER
		}
		private var parts: List<P>? = null

		init {
			isClickable = false
			isFocusable = false
			importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
		}

		private fun r(lo: Float, hi: Float) = lo + Random.nextFloat() * (hi - lo)

		private fun build(w: Float, h: Float): List<P> {
			fun many(n: Int, make: (Int) -> P) = List(n, make)
			return when (kind) {
				"love" -> many(26) { P(r(0f, w), h + r(0f, h * 0.3f), 0f, -r(h * 0.35f, h * 0.6f), r(1f, 2.2f), pick(HEARTS), r(0f, 6f), r(0f, 1f), 0f) }
				"laugh" -> many(14) { P(r(w * 0.1f, w * 0.9f), r(h * 0.15f, h * 0.85f), 0f, 0f, r(26f, 46f), pick(SUNNY), r(-0.3f, 0.3f), it * 0.13f, 0f) }
				"hi" -> many(40) { P(-w * 0.2f, r(0f, h), w * r(0.55f, 0.75f), 0f, r(1f, 2f), pick(SPARKS), r(0f, 6f), it * 0.03f, 0f) }
				"bye" -> many(30) { P(r(0f, w * 1.3f), -r(0f, h * 0.4f), -r(w * 0.12f, w * 0.25f), r(h * 0.22f, h * 0.38f), r(1.2f, 2f), pick(PETALS), r(0f, 6f), r(0f, 1f), r(-2f, 2f)) }
				"sleepy" -> many(12) { P(r(w * 0.1f, w * 0.9f), h * r(0.7f, 1f), r(-12f, 12f), -r(h * 0.12f, h * 0.22f), r(22f, 40f), pick(SLEEPY), r(0f, 6f), r(0f, 2f), 0f) }
				"sad" -> many(70) { P(r(0f, w), -r(0f, h), -w * 0.04f, h * r(0.9f, 1.3f), r(1f, 1.6f), pick(RAIN), 0f, r(0f, 0.8f), 0f) }
				"wow" -> many(28) { P(ox, oy, 0f, 0f, r(0.5f, 1f), if (it % 2 == 0) Color.WHITE else 0xFFFFE66D.toInt(), (it / 28f) * 2f * PI.toFloat() + r(-0.05f, 0.05f), r(0f, 0.15f), 0f) }
				"party" -> many(90) { P(r(0f, w), -r(0f, h * 0.5f), r(-w * 0.08f, w * 0.08f), r(h * 0.28f, h * 0.45f), r(1.4f, 2.4f), pick(CONFETTI), r(0f, 6f), r(0f, 0.6f), r(-6f, 6f)) }
				"cool" -> many(22) { P(r(0f, w), r(0f, h), 0f, 0f, r(1.5f, 3f), pick(SPARKS), r(0f, 6f), r(0f, 2.2f), 0f) }
				"food" -> many(16) { P(r(w * 0.05f, w * 0.95f), -r(dp(30f), h * 0.6f), 0f, h * r(0.35f, 0.5f), r(1.6f, 2.2f), it % 3, r(0f, 6f), r(0f, 1f), r(-2f, 2f)) }
				"music" -> many(18) { P(r(0f, w), h + r(0f, h * 0.2f), r(w * 0.04f, w * 0.08f), -r(h * 0.3f, h * 0.45f), r(24f, 38f), pick(NOTES), r(0f, 6f), r(0f, 1.2f), 0f) }
				"thanks" -> many(24) { P(ox, oy, 0f, 0f, r(1f, 1.8f), if (it % 3 == 0) pick(SPARKS) else pick(HEARTS), (it / 24f) * 2f * PI.toFloat(), r(0f, 0.25f), r(0.35f, 0.5f)) }
				else -> emptyList()
			}
		}

		override fun onDraw(canvas: Canvas) {
			val w = width.toFloat()
			val h = height.toFloat()
			if (w <= 0f || h <= 0f) {
				postInvalidateOnAnimation()
				return
			}
			val list = parts ?: build(w, h).also { parts = it }
			val t = now() - start
			if (t >= duration) {
				post(done)
				return
			}
			// Fades in over 0.2 s and out over the last 0.5 s.
			val fade = minOf(1f, t / 0.2f, (duration - t) / 0.5f).coerceIn(0f, 1f)

			when (kind) {
				"sleepy" -> canvas.drawColor(Color.argb((90 * fade).toInt(), 10, 14, 40))
				"sad" -> canvas.drawColor(Color.argb((45 * fade).toInt(), 40, 70, 140))
				"wow" -> if (t < 0.12f) canvas.drawColor(Color.argb((120 * (1f - t / 0.12f)).toInt(), 255, 255, 255))
			}

			for (p in list) {
				val a = t - p.delay
				if (a < 0f) continue
				val alpha = (255 * fade).toInt()
				when (kind) {
					"love" -> heart(canvas, p.x + sin(a * 2f + p.phase) * dp(16f), p.y + p.vy * a, p.size, p.color, alpha)
					"laugh" -> {
						val life = (a / 1.1f)
						if (life > 1f) continue
						val pop = if (life < 0.2f) life / 0.2f * 1.25f else 1.25f - (life - 0.2f) * 0.3f
						word(canvas, "HA", p.x, p.y, dp(p.size) * pop, p.color, (alpha * (1f - life * life)).toInt(), p.phase * 40f)
					}
					"hi" -> sparkle(canvas, p.x + p.vx * a, p.y + sin(a * 5f + p.phase) * dp(10f), p.size, p.color, (alpha * twinkle(a, p.phase)).toInt())
					"bye", "party" -> {
						val x = p.x + p.vx * a + sin(a * 3f + p.phase) * dp(14f)
						val y = p.y + p.vy * a
						flake(canvas, x, y, p.size, p.color, alpha, a * p.spin + p.phase, kind == "party")
					}
					"sleepy" -> word(canvas, "z", p.x + p.vx * a + sin(a * 2f + p.phase) * dp(10f), p.y + p.vy * a, dp(p.size) * (0.7f + a * 0.2f), p.color, (alpha * (1f - (a / 3f).coerceIn(0f, 1f))).toInt(), -12f)
					"sad" -> {
						val y = (p.y + p.vy * a) % (h + dp(40f))
						paint.color = p.color
						paint.alpha = (alpha * 0.8f).toInt()
						val x = p.x + p.vx * a
						canvas.drawRect(x, y, x + px * 0.7f * p.size, y + px * 5f * p.size, paint)
					}
					"wow" -> {
						val life = (a / 0.9f).coerceIn(0f, 1f)
						val reach = maxOf(w, h)
						val inner = dp(60f) + reach * life * 0.6f
						val outer = inner + reach * 0.35f * p.size
						paint.color = p.color
						paint.alpha = (alpha * (1f - life)).toInt()
						paint.strokeWidth = px * 1.5f
						canvas.drawLine(p.x + cos(p.phase) * inner, p.y + sin(p.phase) * inner, p.x + cos(p.phase) * outer, p.y + sin(p.phase) * outer, paint)
					}
					"cool" -> sparkle(canvas, p.x, p.y, p.size * twinkle(a * 1.6f, p.phase), p.color, alpha)
					"food" -> {
						val fall = p.y + p.vy * a
						val floor = h - dp(40f)
						val y = if (fall < floor) fall else floor - kotlin.math.abs(sin((fall - floor) / dp(40f))) * dp(24f)
						food(canvas, p.x, y, p.size, p.color, alpha)
					}
					"music" -> word(canvas, if (p.color == NOTES[0] || p.color == NOTES[2]) "♪" else "♫", p.x + sin(a * 3f + p.phase) * dp(24f), p.y + p.vy * a, dp(p.size), p.color, alpha, sin(a * 4f + p.phase) * 12f)
					"thanks" -> {
						val dist = maxOf(w, h) * p.spin * minOf(1f, a / 1.4f)
						val x = p.x + cos(p.phase) * dist
						val y = p.y + sin(p.phase) * dist
						if (p.color in HEARTS) heart(canvas, x, y, p.size, p.color, alpha) else sparkle(canvas, x, y, p.size, p.color, alpha)
					}
				}
			}
			postInvalidateOnAnimation()
		}

		private fun twinkle(a: Float, phase: Float) = (0.5f + 0.5f * sin(a * 6f + phase)).coerceIn(0f, 1f)

		/** A 7x6 pixel heart centred on (x, y). */
		private fun heart(c: Canvas, x: Float, y: Float, scale: Float, color: Int, alpha: Int) {
			paint.color = color
			paint.alpha = alpha
			val s = px * scale
			for ((row, line) in HEART.withIndex()) for ((col, ch) in line.withIndex()) {
				if (ch != '#') continue
				val left = x + (col - 3.5f) * s
				val top = y + (row - 3f) * s
				c.drawRect(left, top, left + s, top + s, paint)
			}
		}

		/** A four-point pixel star. */
		private fun sparkle(c: Canvas, x: Float, y: Float, scale: Float, color: Int, alpha: Int) {
			if (alpha <= 0 || scale <= 0.05f) return
			paint.color = color
			paint.alpha = alpha
			val s = px * scale
			c.drawRect(x - s / 2, y - s * 2.5f, x + s / 2, y + s * 2.5f, paint)
			c.drawRect(x - s * 2.5f, y - s / 2, x + s * 2.5f, y + s / 2, paint)
			paint.alpha = alpha / 2
			c.drawRect(x - s * 1.5f, y - s * 1.5f, x + s * 1.5f, y + s * 1.5f, paint)
		}

		/** A confetti strip or petal, turning as it falls. */
		private fun flake(c: Canvas, x: Float, y: Float, scale: Float, color: Int, alpha: Int, angle: Float, strip: Boolean) {
			paint.color = color
			paint.alpha = alpha
			val s = px * scale
			c.save()
			c.rotate(Math.toDegrees(angle.toDouble()).toFloat(), x, y)
			// Squashing the width with cos(angle) makes it look like it flips over.
			val wide = (if (strip) s * 1.2f else s * 2f) * (0.3f + 0.7f * kotlin.math.abs(cos(angle * 1.7f)))
			val tall = if (strip) s * 2.6f else s * 1.4f
			c.drawRect(x - wide, y - tall / 2, x + wide, y + tall / 2, paint)
			c.restore()
		}

		private fun word(c: Canvas, s: String, x: Float, y: Float, size: Float, color: Int, alpha: Int, tilt: Float) {
			if (alpha <= 0) return
			text.textSize = size
			c.save()
			c.rotate(tilt, x, y)
			text.color = Color.argb(alpha / 2, 0, 0, 0)
			c.drawText(s, x + size * 0.06f, y + size * 0.06f, text)
			text.color = color
			text.alpha = alpha
			c.drawText(s, x, y, text)
			c.restore()
		}

		/** Pixel food: 0 pizza slice, 1 cookie, 2 doughnut. */
		private fun food(c: Canvas, x: Float, y: Float, scale: Float, which: Int, alpha: Int) {
			val s = px * scale
			val art = FOODS[which]
			for ((row, line) in art.withIndex()) for ((col, ch) in line.withIndex()) {
				val color = FOOD_COLOURS[ch] ?: continue
				paint.color = color
				paint.alpha = alpha
				val left = x + (col - line.length / 2f) * s
				val top = y + (row - art.size / 2f) * s
				c.drawRect(left, top, left + s, top + s, paint)
			}
		}
	}

	private fun pick(colors: IntArray) = colors[Random.nextInt(colors.size)]

	private val HEART = listOf(
		".##.##.",
		"#######",
		"#######",
		".#####.",
		"..###..",
		"...#...",
	)
	private val HEARTS = intArrayOf(0xFFFF4F7B.toInt(), 0xFFFF7AA2.toInt(), 0xFFE0245E.toInt(), 0xFFFFA8C5.toInt())
	private val SUNNY = intArrayOf(0xFFFFD23F.toInt(), 0xFFFF9F1C.toInt(), 0xFFFFE66D.toInt())
	private val SPARKS = intArrayOf(Color.WHITE, 0xFFFFF3A3.toInt(), 0xFFB5F2FF.toInt(), 0xFFFFC6F0.toInt())
	private val PETALS = intArrayOf(0xFFFFB7C5.toInt(), 0xFFFFD6E0.toInt(), 0xFFF7A1B8.toInt(), 0xFFFFE8EE.toInt())
	private val SLEEPY = intArrayOf(0xFFB9C7FF.toInt(), 0xFFDDE4FF.toInt(), 0xFF9AA8F0.toInt())
	private val RAIN = intArrayOf(0xFF7FB2FF.toInt(), 0xFFA9CCFF.toInt(), 0xFF5D8FE0.toInt())
	private val CONFETTI = intArrayOf(0xFFFF4F7B.toInt(), 0xFFFFD23F.toInt(), 0xFF3DDC97.toInt(), 0xFF4CC9F0.toInt(), 0xFFB388FF.toInt(), 0xFFFF9F1C.toInt())
	private val NOTES = intArrayOf(0xFFFF7AA2.toInt(), 0xFF4CC9F0.toInt(), 0xFFFFD23F.toInt(), 0xFFB388FF.toInt(), 0xFF3DDC97.toInt())

	private val FOODS = listOf(
		listOf(
			"cccccccc",
			"yyryyyry",
			".yyyyry.",
			".yryyyy.",
			"..yyyy..",
			"..yyr...",
			"...yy...",
			"...y....",
		),
		listOf(
			"..bbbb..",
			".bbdbbb.",
			"bbbbbdbb",
			"bdbbbbbb",
			"bbbbdbbb",
			"bbdbbbdb",
			".bbbbbb.",
			"..bbbb..",
		),
		listOf(
			"..pppp..",
			".pspppp.",
			"pppppspp",
			"pps..ppp",
			"ppp..pps",
			"psppppp.",
			".pppspp.",
			"..pppp..",
		),
	)
	private val FOOD_COLOURS = mapOf(
		'c' to 0xFFC98A3D.toInt(), 'y' to 0xFFFFD23F.toInt(), 'r' to 0xFFE0453A.toInt(),
		'b' to 0xFFD9A066.toInt(), 'd' to 0xFF5A3A22.toInt(),
		'p' to 0xFFFF8FB8.toInt(), 's' to 0xFFFFFFFF.toInt(),
	)
}
