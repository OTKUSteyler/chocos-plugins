package com.dxckie.capri

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.view.Choreographer
import android.view.ViewGroup
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/**
 * Capri's star strike, in place of the spell: a faint constellation and one bright star appear, a trail of
 * sparkles runs from her to the star, then a bolt strikes it and it bursts into rays and a ring, and a
 * crosshair holds on it as everything fades. Drawn on the window's overlay, so it works on any Android.
 * Main thread only.
 */
internal object StarStrike {
	private const val SECONDS = 5.4f
	private const val BOLT_AT = 2.0f
	private const val RED = 0xFFFF003D.toInt()
	private const val PURPLE = 0xFF7A3DFF.toInt()
	private const val LAVENDER = 0xFFC9B8FF.toInt()

	private val fill = Paint().apply { style = Paint.Style.FILL; isAntiAlias = false }
	private val line = Paint().apply { style = Paint.Style.STROKE; isAntiAlias = false; strokeJoin = Paint.Join.MITER; strokeCap = Paint.Cap.SQUARE }

	private var decor: ViewGroup? = null
	private var layer: Layer? = null
	private var running = false
	private var startedAt = 0f
	private var fromX = 0f
	private var fromY = 0f
	private var toX = 0f
	private var toY = 0f
	private var stars = FloatArray(0)
	private var rays = emptyList<FloatArray>()
	private var sparks = FloatArray(0)

	private fun now() = SystemClock.uptimeMillis() / 1000f

	val active get() = running

	/** Starts it, from Capri at ([x], [y]); a no-op while one is playing. */
	fun start(root: ViewGroup, x: Float, y: Float) {
		if (running) return
		val w = root.width.toFloat(); val h = root.height.toFloat()
		if (w <= 0f) return
		decor = root
		fromX = x; fromY = y
		// The star hangs high, on the side farther from her.
		toX = if (x < w / 2f) w * (0.62f + Random.nextFloat() * 0.25f) else w * (0.13f + Random.nextFloat() * 0.25f)
		toY = h * (0.12f + Random.nextFloat() * 0.18f)
		// The constellation: dots in a patch beside her, x y size.
		val cx = if (x < w / 2f) w * 0.3f else w * 0.7f
		stars = FloatArray(30 * 3).also { a ->
			for (i in 0 until 30) {
				a[i * 3] = cx + (Random.nextFloat() - 0.5f) * w * 0.5f
				a[i * 3 + 1] = h * (0.25f + Random.nextFloat() * 0.3f)
				a[i * 3 + 2] = dp(1f + Random.nextFloat() * 1.6f)
			}
		}
		// Burst rays: angle, length, half-width (radians), colour.
		rays = List(30) {
			floatArrayOf(Random.nextFloat() * 6.2832f, dp(30f + Random.nextFloat() * 70f), 0.02f + Random.nextFloat() * 0.05f,
				when (Random.nextInt(4)) { 0 -> RED.toFloat(); 1 -> PURPLE.toFloat(); else -> 0xFFFFFFFF.toInt().toFloat() })
		}
		// Spark shower after the strike: angle, speed.
		sparks = FloatArray(28 * 2).also { v -> for (i in 0 until 28) { v[i * 2] = Random.nextFloat() * 6.2832f; v[i * 2 + 1] = dp(40f + Random.nextFloat() * 140f) } }
		startedAt = now()
		layer = Layer().also { root.overlay.add(it) }
		running = true
		Choreographer.getInstance().postFrameCallback(frame)
	}

	fun clear() {
		running = false
		Choreographer.getInstance().removeFrameCallback(frame)
		layer?.let { l -> decor?.overlay?.remove(l) }
		layer = null
		decor = null
	}

	private val frame = object : Choreographer.FrameCallback {
		override fun doFrame(frameTimeNanos: Long) {
			if (!running) return
			if (now() - startedAt > SECONDS) { clear(); return }
			layer?.invalidateSelf()
			Choreographer.getInstance().postFrameCallback(this)
		}
	}

	/** The bolt's zigzag for animation frame [tick]: new corners every frame, so it crackles. */
	private fun zigAt(tick: Int): List<Pair<Float, Float>> {
		val rnd = Random(tick * 977 + 13)
		val n = 16
		val dx = toX - fromX; val dy = toY - fromY
		val len = hypot(dx, dy).coerceAtLeast(1f)
		val nx = -dy / len; val ny = dx / len
		return List(n + 1) { i ->
			val k = i / n.toFloat()
			val off = if (i == 0 || i == n) 0f else (if (i % 2 == 0) 1f else -1f) * dp(8f + rnd.nextFloat() * 9f)
			(fromX + dx * k + nx * off) to (fromY + dy * k + ny * off)
		}
	}

	/** A four-pointed star with concave sides, [r] tall and wide. */
	private fun starPath(cx: Float, cy: Float, r: Float): Path {
		val i = r * 0.2f
		return Path().apply {
			moveTo(cx, cy - r); lineTo(cx + i, cy - i); lineTo(cx + r, cy); lineTo(cx + i, cy + i)
			lineTo(cx, cy + r); lineTo(cx - i, cy + i); lineTo(cx - r, cy); lineTo(cx - i, cy - i); close()
		}
	}

	private class Layer : Drawable() {
		private var bmp: Bitmap? = null
		private var bmpCanvas: Canvas? = null
		private val blit = Paint().apply { isFilterBitmap = false }

		/** Drawn small, scaled up unsmoothed and blitted in bands, some slid sideways: pixelated and glitchy like her bolt. */
		override fun draw(canvas: Canvas) {
			val root = decor ?: return
			if (bounds.width() != root.width || bounds.height() != root.height) setBounds(0, 0, root.width, root.height)
			val w = root.width.toFloat(); val h = root.height.toFloat()
			val t = now() - startedAt
			val pix = dp(2.2f)
			val bw = maxOf(1, (w / pix).toInt() + 1); val bh = maxOf(1, (h / pix).toInt() + 1)
			if (bmp?.width != bw || bmp?.height != bh) { bmp?.recycle(); bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888); bmpCanvas = Canvas(bmp!!) }
			val bm = bmp ?: return; val bc = bmpCanvas ?: return
			bm.eraseColor(0)
			bc.save(); bc.scale(1f / pix, 1f / pix)
			scene(bc, w, h, t)
			bc.restore()
			val tick = (t * 24f).toInt()
			val rnd = Random(tick * 53 + 9)
			// Torn hardest right at the strike.
			val chance = if (t in BOLT_AT..(BOLT_AT + 0.5f)) 0.4f else 0.1f
			var y = 0
			while (y < bm.height) {
				val bandH = min(4, bm.height - y)
				val dx = if (rnd.nextFloat() < chance) rnd.nextInt(-8, 9) * pix * 0.7f else 0f
				canvas.drawBitmap(bm, Rect(0, y, bm.width, y + bandH), RectF(dx, y * pix, dx + bm.width * pix, (y + bandH) * pix), blit)
				y += bandH
			}
		}

		private fun scene(canvas: Canvas, w: Float, h: Float, t: Float) {
			val fade = min(1f, (SECONDS - t) / 0.7f).coerceIn(0f, 1f)
			fun a(v: Float) = (v.coerceIn(0f, 1f) * fade * 255).toInt()

			// 1. Constellation fades in; the bright star twinkles in a little later.
			val dim = (t / 0.6f).coerceIn(0f, 1f)
			for (i in 0 until stars.size / 3) {
				fill.color = LAVENDER; fill.alpha = a(dim * (0.4f + 0.4f * sin(t * 3f + i)))
				canvas.drawCircle(stars[i * 3], stars[i * 3 + 1], stars[i * 3 + 2], fill)
			}
			line.color = PURPLE; line.strokeWidth = dp(0.8f); line.alpha = a(dim * 0.5f)
			for (i in 0 until (dim * 9f).toInt()) canvas.drawLine(stars[i * 3], stars[i * 3 + 1], stars[(i + 1) * 3], stars[(i + 1) * 3 + 1], line)
			val grow = ((t - 0.3f) / 0.4f).coerceIn(0f, 1f)
			val twinkle = 1f + 0.12f * sin(t * 9f)
			val struck = t >= BOLT_AT
			val burst = ((t - BOLT_AT) / 0.6f).coerceIn(0f, 1f)

			// 2. Trail of sparkles from her to the star, growing toward it.
			val trail = ((t - 1.0f) / 0.9f).coerceIn(0f, 1f)
			val dots = 36
			for (i in 0 until (dots * trail).toInt()) {
				val k = i / dots.toFloat()
				fill.color = if (i % 5 == 0) 0xFFFFFFFF.toInt() else LAVENDER
				fill.alpha = a(0.35f + 0.6f * k)
				canvas.drawCircle(fromX + (toX - fromX) * k, fromY + (toY - fromY) * k, dp(0.8f + 2.2f * k), fill)
			}

			// Glints run up the trail, and the dots twinkle.
			if (trail >= 1f && !struck) {
				for (g in 0 until 3) {
					val k = ((t * 0.9f + g / 3f) % 1f)
					fill.color = 0xFFFFFFFF.toInt(); fill.alpha = a(1f)
					canvas.drawPath(starPath(fromX + (toX - fromX) * k, fromY + (toY - fromY) * k, dp(5f + 4f * k)), fill)
				}
			}
			// Charge: rings close in on her just before the bolt.
			if (t in (BOLT_AT - 0.6f)..BOLT_AT) {
				val c = (t - (BOLT_AT - 0.6f)) / 0.6f
				for (g in 0 until 3) {
					val k = ((c + g / 3f) % 1f)
					line.color = if (g == 1) PURPLE else RED; line.strokeWidth = dp(1.4f); line.alpha = a(k)
					canvas.drawCircle(fromX, fromY, dp(60f) * (1f - k) + dp(8f), line)
				}
			}

			// 3. The strike: a ring round her, the zigzag bolt, then the burst at the star.
			if (struck) {
				val fl = (1f - (t - BOLT_AT) / 0.55f).coerceIn(0f, 1f)
				if (fl > 0f && Random((t * 24f).toInt() * 31).nextFloat() < 0.85f) {
					line.color = RED; line.alpha = a(fl); line.strokeWidth = dp(1.5f)
					canvas.drawCircle(fromX, fromY, dp(34f) + dp(8f) * (1f - fl), line)
					val path = Path()
					val tick = (t * 24f).toInt()
					zigAt(tick).forEachIndexed { i, (px, py) -> if (i == 0) path.moveTo(px, py) else path.lineTo(px, py) }
					line.color = PURPLE; line.strokeWidth = dp(7f); line.alpha = a(fl); canvas.drawPath(path, line)
					line.color = RED; line.strokeWidth = dp(5f); canvas.drawPath(path, line)
					line.color = 0xFFFFFFFF.toInt(); line.strokeWidth = dp(2.2f); canvas.drawPath(path, line)
				}
				// White flash, then three shockwave rings and falling sparks.
				val flash = (1f - (t - BOLT_AT) / 0.15f).coerceIn(0f, 1f)
				if (flash > 0f) { fill.color = 0xFFFFFFFF.toInt(); fill.alpha = a(flash * 0.3f); canvas.drawRect(0f, 0f, w, h, fill) }
				for (g in 0 until 3) {
					val k = ((t - BOLT_AT - g * 0.14f) / 0.9f)
					if (k in 0f..1f) { line.color = if (g == 1) PURPLE else RED; line.strokeWidth = dp(2.2f) * (1f - k); line.alpha = a(1f - k); canvas.drawCircle(toX, toY, dp(24f) + dp(170f) * k, line) }
				}
				val sp = t - BOLT_AT
				for (i in 0 until sparks.size / 2) {
					val ang = sparks[i * 2]; val v = sparks[i * 2 + 1]
					val px = toX + cos(ang) * v * sp * 1.4f; val py = toY + sin(ang) * v * sp * 1.4f + dp(60f) * sp * sp
					fill.color = if (i % 3 == 0) RED else if (i % 3 == 1) 0xFFFFFFFF.toInt() else LAVENDER
					fill.alpha = a(1f - sp / 1.6f)
					canvas.drawRect(px, py, px + dp(2.5f), py + dp(2.5f), fill)
				}
				val rayFade = (1f - burst).coerceIn(0f, 1f) * (if (burst < 0.1f) 1f else 0.9f)
				for (r in rays) {
					val len = r[1] * (0.4f + 0.6f * burst); val r0 = dp(22f) + dp(14f) * burst
					val ang = r[0] + sin(t * 40f + r[1]) * 0.012f; val half = r[2] * (0.85f + 0.3f * sin(t * 30f + r[0]))
					val p = Path()
					p.moveTo(toX + cos(ang - half) * r0, toY + sin(ang - half) * r0)
					p.lineTo(toX + cos(ang) * (r0 + len), toY + sin(ang) * (r0 + len))
					p.lineTo(toX + cos(ang + half) * r0, toY + sin(ang + half) * r0)
					p.close()
					fill.color = r[3].toInt(); fill.alpha = a(rayFade)
					canvas.drawPath(p, fill)
				}
			}

			// 4. The star itself, ringed in pink and purple; after the strike, a crosshair holds on it.
			val sr = dp(11f) * grow * twinkle * (if (struck) 1.9f else 1f)
			if (grow > 0f) {
				if (struck) {
					line.color = RED; line.strokeWidth = dp(1.6f); line.alpha = a(1f)
					canvas.drawCircle(toX, toY, dp(40f), line)
					line.color = PURPLE; line.alpha = a(0.8f)
					canvas.drawCircle(toX, toY, dp(44f), line)
					if (burst >= 0.7f) {
						line.color = LAVENDER; line.strokeWidth = dp(1.4f); line.alpha = a(0.9f)
						canvas.drawLine(toX, toY - dp(110f), toX, toY + dp(110f), line)
						canvas.drawLine(toX - dp(110f), toY, toX + dp(110f), toY, line)
					}
				}
				fill.color = 0xFFFFFFFF.toInt(); fill.alpha = a(1f)
				canvas.drawPath(starPath(toX, toY, sr), fill)
				if (struck) { fill.color = RED; canvas.drawPath(starPath(toX, toY, sr * 0.42f), fill) }
			}
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity() = PixelFormat.TRANSLUCENT
	}
}
