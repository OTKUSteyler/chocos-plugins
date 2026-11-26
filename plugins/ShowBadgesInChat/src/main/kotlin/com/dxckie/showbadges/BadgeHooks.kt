package com.dxckie.showbadges

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.BitmapDrawable
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ImageSpan
import android.view.View
import android.view.ViewGroup
import android.widget.RelativeLayout
import android.widget.TextView
import app.valenced.xposed.api.DexFinder
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import org.json.JSONObject
import java.lang.reflect.Method
import java.net.URL
import java.util.WeakHashMap
import java.util.concurrent.Executors

private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"
private const val MESSAGE = "com.discord.chat.bridge.Message"

// JS appends this to badge icon URLs so the image hook knows which icons are ours
private const val MARKER = "#dxckie.show-badges"
private const val CACHE_CAPACITY = 2000
private const val BADGE_SCALE = 1.15f

/** Arguments of `TextUtils.appendImage`, found by type (R8 merged it with its `$default` overload). */
private class AppendImageArgs(method: Method) {
    private val types = method.parameterTypes
    val url = types.indexOf(String::class.java)
    private val cornerRadius = types.indexOf(Float::class.javaPrimitiveType)
    private val mask = types.lastIndex

    fun clearCornerRadius(args: Array<Any?>) {
        args[cornerRadius] = 0f
        // Bits count from the first argument after the builder, the receiver
        args[mask] = (args[mask] as Int) and (1 shl (cornerRadius - 1)).inv()
    }
}

internal class BadgeHooks(dexFinder: DexFinder) {
    // message id -> badge icon URLs
    private val badges = object : LinkedHashMap<String, List<String>>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<String>>) = size > CACHE_CAPACITY
    }

    // Main thread only: header views showing a message, with its id
    private val shown = WeakHashMap<TextView, String>()
    private val images = object : LinkedHashMap<String, Bitmap>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap>) = size > 200
    }
    private val loading = HashSet<String>()
    private val io = Executors.newFixedThreadPool(2)
    private val mainHandler = Handler(Looper.getMainLooper())
    private var ids: ViewIds? = null

    private val messageIdField = dexFinder.classLoader.loadClass(MESSAGE).getDeclaredField("id")
        .apply { isAccessible = true }

    private val unhooks: List<XC_MethodHook.Unhook>

    init {
        val appendImage = dexFinder.findMethod {
            matcher { usingEqStrings("rc", "imageUrl") }
        } ?: error("TextUtils.appendImage not found")
        val args = AppendImageArgs(appendImage)

        val setMessage = dexFinder.findMethod {
            matcher {
                declaredClass(MESSAGE_VIEW)
                usingEqStrings("message", "messageContext", "eventHandler")
            }
        } ?: error("MessageView.setMessage not found")

        unhooks = listOf(
            // Discord rounds inline images by default, which cuts off the quest badge
            XposedBridge.hookMethod(appendImage, object : XC_MethodHook() {
                override fun beforeHookedMethod(param: MethodHookParam) {
                    val url = param.args[args.url] as? String ?: return
                    val index = url.indexOf(MARKER)
                    if (index < 0) return
                    param.args[args.url] = url.substring(0, index)
                    args.clearCornerRadius(param.args)
                }
            }),
            XposedBridge.hookMethod(setMessage, object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    try {
                        val view = param.thisObject as RelativeLayout
                        val id = messageIdField.get(param.args[0]) as String
                        val ids = ids ?: ViewIds(view).also { ids = it }
                        val header = view.childWithId(ids.header) as? ViewGroup ?: return
                        val name = header.findViewById<View>(ids.authorName) as? TextView ?: return
                        // Only messages that start a group show their author
                        if (name.visibility != View.VISIBLE) return
                        shown[name] = id
                        apply(name, id)
                    } catch (e: Throwable) {
                        XposedBridge.log("ShowBadges: header hook failed: $e")
                    }
                }
            }),
        )
    }

    private class ViewIds(view: View) {
        val header = view.idOf("header")
        val authorName = view.idOf("author_name")
    }

    fun put(json: String) {
        val updates = JSONObject(json).let { obj ->
            obj.keys().asSequence().associateWith { key ->
                obj.getJSONArray(key).let { array -> List(array.length(), array::getString) }
            }
        }
        synchronized(badges) { badges.putAll(updates) }
        mainHandler.post {
            for ((name, id) in shown) if (id in updates) apply(name, id)
        }
    }

    fun clear() {
        synchronized(badges) { badges.clear() }
    }

    fun dispose() {
        for (unhook in unhooks) unhook.unhook()
        io.shutdownNow()
        synchronized(badges) { badges.clear() }
        mainHandler.post {
            for (name in shown.keys) strip(name)
            shown.clear()
            images.clear()
        }
    }

    // Main thread. Badges are appended to the name's text, which Discord sets again on every bind
    private fun apply(name: TextView, id: String) {
        val urls = synchronized(badges) { badges[id] }.orEmpty()
        // The common case: nothing to show and nothing of ours to remove
        if (urls.isEmpty() && (name.text as? Spanned)?.getSpans(0, name.text.length, GapDrawableSpan::class.java).isNullOrEmpty()) return
        val text = SpannableStringBuilder(name.text)
        removeBadges(text)
        if (urls.isEmpty()) {
            if (text.length != name.text.length) name.text = text
            return
        }

        val size = (name.textSize * BADGE_SCALE).toInt()
        val gap = size / 12
        for (url in urls) {
            val bitmap = images[url]
            if (bitmap == null) {
                load(url)
                continue
            }
            val start = text.length
            text.append(" ")
            text.setSpan(
                GapDrawableSpan(BitmapDrawable(name.resources, bitmap).apply { setBounds(0, 0, size, size) }, gap),
                start, start + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
            )
        }
        if (text.toString() != name.text.toString()) name.text = text
    }

    private fun removeBadges(text: SpannableStringBuilder) {
        for (span in text.getSpans(0, text.length, GapDrawableSpan::class.java).reversed()) {
            val start = text.getSpanStart(span)
            val end = text.getSpanEnd(span)
            text.removeSpan(span)
            text.delete(start, end)
        }
    }

    private fun strip(name: TextView) {
        val text = SpannableStringBuilder(name.text)
        removeBadges(text)
        name.text = text
    }

    private fun load(url: String) {
        if (!loading.add(url)) return
        io.execute {
            val bitmap = try {
                URL(url).openStream().use(BitmapFactory::decodeStream)
            } catch (_: Throwable) {
                null
            }
            mainHandler.post {
                loading.remove(url)
                if (bitmap == null) return@post
                images[url] = bitmap
                for ((name, id) in shown) if (url in synchronized(badges) { badges[id] }.orEmpty()) apply(name, id)
            }
        }
    }
}

/** Image span with space after it. */
private class GapDrawableSpan(drawable: android.graphics.drawable.Drawable, private val gap: Int) :
    ImageSpan(drawable, ALIGN_BOTTOM) {
    override fun getSize(
        paint: android.graphics.Paint, text: CharSequence?, start: Int, end: Int, fm: android.graphics.Paint.FontMetricsInt?,
    ) = super.getSize(paint, text, start, end, fm) + gap
}

@Suppress("DiscouragedApi")
private fun View.idOf(name: String) = resources.getIdentifier(name, "id", context.packageName)

// Not findViewById, as nested messages (such as replies) have views with the same IDs
private fun ViewGroup.childWithId(id: Int): View? =
    (0 until childCount).asSequence().map(::getChildAt).firstOrNull { it.id == id }
