package com.dxckie.capri

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.util.Base64
import android.util.TypedValue
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Capri's speech bubble: a dark panel with two cut corners and a purple edge with an offset shadow, her
 * portrait on the left, then "CAPRI / NIGHT-CITY" with a green tag over what she says in bold.
 */
internal class CapriBubble(context: Context) : LinearLayout(context) {
	private val title = TextView(context)
	private val line = TextView(context)

	/** What she says. */
	var text: CharSequence
		get() = line.text
		set(value) { line.text = value }

	init {
		orientation = HORIZONTAL
		gravity = Gravity.CENTER_VERTICAL
		val pad = dp(10f).toInt()
		setPadding(pad, pad, pad + dp(3f).toInt(), pad + dp(3f).toInt())
		background = PanelDrawable()
		val face = ImageView(context).apply {
			scaleType = ImageView.ScaleType.FIT_XY
			runCatching {
				val bytes = Base64.decode(CapriBubbleData.PORTRAIT, Base64.DEFAULT)
				setCrisp(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
			}
			// Keep the pixel art crisp.
			setLayerType(LAYER_TYPE_NONE, null)
		}
		addView(face, LayoutParams(dp(44f).toInt(), dp(44f).toInt()))
		val col = LinearLayout(context).apply { orientation = VERTICAL }
		val head = LinearLayout(context).apply { orientation = HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
		head.addView(TextView(context).apply {
			setTextSize(TypedValue.COMPLEX_UNIT_DIP, 10f); typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
			setTextColor(0xFFE8E4F5.toInt()); this.text = "CAPRI"
		})
		title.apply {
			setTextSize(TypedValue.COMPLEX_UNIT_DIP, 10f); typeface = Typeface.MONOSPACE
			setTextColor(0xFF8F89A6.toInt()); this.text = " / NIGHT-CITY"
		}
		head.addView(title)
		head.addView(TextView(context).apply {
			setTextSize(TypedValue.COMPLEX_UNIT_DIP, 8f); typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
			setTextColor(0xFF0B0A12.toInt()); setBackgroundColor(0xFF00F452.toInt())
			setPadding(dp(4f).toInt(), 0, dp(4f).toInt(), 0); this.text = "LIVE"
		}, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(6f).toInt() })
		col.addView(head)
		line.apply {
			setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f); setTextColor(0xFFFFFFFF.toInt())
			ggSans(context)?.let { typeface = Typeface.create(it, Typeface.BOLD) }
			maxWidth = dp(170f).toInt()
			setPadding(0, dp(2f).toInt(), 0, 0)
		}
		col.addView(line)
		addView(col, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { leftMargin = dp(10f).toInt() })
	}

	private class PanelDrawable : Drawable() {
		private val fill = Paint().apply { color = 0xFF16121F.toInt(); style = Paint.Style.FILL }
		private val edge = Paint().apply { color = 0xFF7A3DFF.toInt(); style = Paint.Style.FILL }
		private val rim = Paint().apply { color = 0xFF7A3DFF.toInt(); style = Paint.Style.STROKE; strokeWidth = dp(1.5f) }

		private fun shape(l: Float, t: Float, r: Float, b: Float, cut: Float) = Path().apply {
			moveTo(l + cut, t); lineTo(r, t); lineTo(r, b - cut); lineTo(r - cut, b); lineTo(l, b); lineTo(l, t + cut); close()
		}

		override fun draw(canvas: Canvas) {
			val b = bounds
			val off = dp(3f)
			val cut = dp(10f)
			val w = b.width().toFloat() - off; val h = b.height().toFloat() - off
			canvas.drawPath(shape(off, off, w + off, h + off, cut), edge)
			canvas.drawPath(shape(0f, 0f, w, h, cut), fill)
			canvas.drawPath(shape(0f, 0f, w, h, cut), rim)
		}

		override fun setAlpha(alpha: Int) {}
		override fun setColorFilter(colorFilter: ColorFilter?) {}
		@Deprecated("Deprecated in Java")
		override fun getOpacity() = PixelFormat.TRANSLUCENT
	}
}
