package com.dxckie.capri

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PointF
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.SystemClock
import android.util.TypedValue
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.sign
import kotlin.math.sin
import kotlin.random.Random

/**
 * Sparkle: a pixel unicorn living on top of Discord.
 *
 * The behaviour follows the design of the exteraGram pet "Clawd" by @itskotovski (the states, the
 * flick physics, peeking, petting, shaking), reimplemented from scratch for Android views with its own
 * phrases; no code from it is used. The art is the unicorn sprite set in sprites/.
 *
 * Everything here runs on the main thread: [tick] drives a small state machine, positions a [PetView]
 * added to the app's DecorView, and moves a speech bubble and a few particles alongside it.
 */
internal enum class State { IDLE, WALK, PRESS, DRAG, PET, FLY, HANG, PEEK, SLEEP, LEAVING, STUCK, SEEK }

/** Small, Medium and Large, in dp: the slider's stops, and what the old three-way setting meant. */
internal val SIZE_DP = floatArrayOf(52f, 64f, 80f)
/** The slider's range, in dp. */
internal const val SIZE_MIN_DP = 40
internal const val SIZE_MAX_DP = 110

/** Capri is shown this much bigger than the size setting's width, at every size. */
private const val SIZE_SCALE = 1.7f
private val SLEEP_SECONDS = intArrayOf(60, 180, 600, 0, 30)

/** Walking pace, dp/s; a trot is twice this. */
private const val WALK_SPEED = 42f
/** A teleporting look's whole move: 17 strip frames at 24 fps. */
/** Shows [bmp] with nearest-neighbour scaling: ImageView filters (blurs) by default when it scales or rotates. */
internal fun ImageView.setCrisp(bmp: Bitmap) {
	setImageDrawable(android.graphics.drawable.BitmapDrawable(resources, bmp).apply { setFilterBitmap(false); setDither(false) })
}

private const val TELEPORT_SECONDS = 17f / 24f

/**
 * How lively it is between touches, per the Activity slider (Calm, Normal, Lively, Hyper). Calm is
 * the old behaviour. Times in seconds, distances in dp.
 * [gap]: between decisions. [walk]: share of decisions that are a walk. [dist]: a walk's length.
 * [stroll]: chance a walk is a long stroll to anywhere on screen. [trot]: chance it hurries.
 * [rest]: standing still after a walk. [nap]: how long a nap lasts before it wakes on its own.
 */
private class Activity(
	val gap: ClosedFloatingPointRange<Float>,
	val walk: Float,
	val dist: ClosedFloatingPointRange<Float>,
	val stroll: Float,
	val trot: Float,
	val rest: ClosedFloatingPointRange<Float>,
	val nap: ClosedFloatingPointRange<Float>,
)

private val ACTIVITY = arrayOf(
	Activity(3.5f..9f, 0.38f, 40f..160f, 0f, 0f, 2.5f..6f, 180f..360f),
	Activity(2f..5f, 0.55f, 60f..260f, 0.15f, 0.2f, 1.5f..4f, 90f..180f),
	Activity(1.2f..3.5f, 0.65f, 80f..360f, 0.25f, 0.35f, 0.8f..2.5f, 60f..120f),
	Activity(0.6f..2f, 0.75f, 100f..500f, 0.35f, 0.5f, 0.3f..1.2f, 30f..60f),
)

private fun ClosedFloatingPointRange<Float>.pick() = start + Random.nextFloat() * (endInclusive - start)
private val activity get() = ACTIVITY[Settings.activity.coerceIn(0, ACTIVITY.size - 1)]
private const val PEEK_AFTER = 45f
/** Turns of the drag path that wind Sparkle up for a fling to the top. */
private const val WIND_TURNS = 2.5f
private const val SPIN_RATE = 900f
/** Standing she is ~128 px tall; her lying art is ~76 px long. */
private const val DIZZY_SCALE = 1.6f

/** Her sleep strip is drawn small: a little bigger, from the floor. */
private const val SLEEP_SCALE = 1.25f
/** How far below the top it has to be dragged before it lets go of the status bar. */
private const val UNSTICK_DP = 56f
/** Below this much happiness (0..100) it gets lonely and asks for attention. */
private const val LONELY = 30
/** Reputation drifts one point back toward 0 this often: it forgives (and forgets) slowly. */
private const val REP_DRIFT_MS = 15 * 60_000L
/** When it adores you, it gives back whatever it took after this long (Pet's clock, seconds). */
private const val ADORE_RETURN_AFTER = 45f
/** Happiness drains one point per this many milliseconds, on or off screen. */
private const val LOVE_DRAIN_MS = 120_000L
/** Seconds an untouched treat stays before it fades. */
private const val TREAT_LIFETIME = 75f
/** In "while typing" mode, how long after the keyboard closes it stays. */
private const val TYPING_LINGER = 4f

internal object Phrases {
	/**
	 * Lines any pet can say. Each moment's line is picked from these plus the current pet's own
	 * ([unicorn], [cat], [dog]), so each keeps the generic ones and add their own flavour. Anything that
	 * names a horn, a pop-tart or a sound only one animal makes belongs in a pet's own set.
	 */
	val shared = mapOf(
		"hello" to listOf("Hi! I'm {me}!", "Oh, hello!"),
		"idle" to listOf("Nice server", "Hmm…", "Drink some water!", "You're doing great", "Who's online?", "*hums*"),
		"tap" to listOf("Hey!", "Boop!", "Hehe", "Yes?", "I'm here!"),
		"annoyed" to listOf("Okay, that's enough poking", "Rude!", "Hmph"),
		"pet" to listOf("So nice…", "More please!", "♥", "Best human"),
		"drag" to listOf("Where are we going?", "Wheee!", "Put me down!"),
		"throw" to listOf("I can fly!", "Weeee!"),
		"dizzy" to listOf("Everything's spinning…", "@_@", "Which way is up?"),
		"wake" to listOf("Huh? I'm awake!", "*yawns*", "Five more minutes…"),
		"jump" to listOf("Boing!", "Yay!", "Hop!"),
		"hang" to listOf("Hanging on!", "It's high up here!", "Help!"),
		"hang_fall" to listOf("Whoa!", "Can't hold on!", "Falling!"),
		"wound" to listOf("Wheeeee!", "Spin me round!", "Faster!"),
		"rocket" to listOf("To the top!", "Up up up!"),
		"stuck" to listOf("I'm stuck!", "Nice view up here", "I live here now", "Pull me down?", "Don't mind me"),
		"unstuck" to listOf("Freedom!", "Back down we go", "Thanks!"),
		"peek" to listOf("Peekaboo!", "I see you", "*peeks*"),
		"found" to listOf("You found me!", "I wasn't hiding!", "Oh, hi!"),
		"shake" to listOf("Earthquake!", "Stop shaking!", "Aaaah!"),
		"slide" to listOf("Slippery!", "Wheee~", "I'm sliding!"),
		"eat" to listOf("Crunchy!", "Yum, pixels", "*munch munch*", "Tastes like a button", "Oops, I ate that"),
		"spit" to listOf("Okay, here you go!", "Ptooey!", "Sorry, sorry!", "Giving it back!"),
		"mail" to listOf("New message!", "Someone wrote!", "Ding!", "Ooh, a message"),
		"mention" to listOf("Someone mentioned you!", "You got pinged!", "Hey, that's you!"),
		"love" to listOf("Aww ♥", "So sweet!", "Love!", "♥♥♥"),
		"laugh" to listOf("Hahaha!", "Hehe!", "That's funny!"),
		"hi" to listOf("Hi hi!", "Hello!", "*waves*"),
		"bye" to listOf("Bye bye!", "See you!", "*waves*", "Come back soon!"),
		"sleepy" to listOf("Sweet dreams!", "*yawns*", "Nap time?", "Night night!"),
		"sad" to listOf("Aww… *hugs*", "It'll be okay", "*pats*", "Sending hugs"),
		"wow" to listOf("Whoa!", "No way!", "Wow!", "Really?!"),
		"party" to listOf("Yay!", "Party time!", "Congrats!", "Woohoo!"),
		"cool" to listOf("*puts on shades*", "So cool!", "Let's gooo!", "Hype!"),
		"food" to listOf("Did someone say {name}?", "Ooh, {name}!", "Can I have some {name}?", "Snacks?", "I'm hungry now"),
		"music" to listOf("♪ La la la ♪", "*bops along*", "Ooh, a song!", "Turn it up!"),
		"thanks" to listOf("So polite!", "Aww ♥", "Manners!"),
		"sent" to listOf("Sent!", "Off it goes!", "Nice one!"),
		"essay" to listOf("That's a whole essay!", "So many words!", "A novel!"),
		"channel_new" to listOf("Ooh, {name}!", "What's happening in {name}?", "Hi, {name}!"),
		"channel_again" to listOf("Back to {name}?", "{name} again!", "We love {name}"),
		"voice_join" to listOf("Ooh, voice chat!", "Let's hang out!", "*listens*"),
		"voice_leave" to listOf("Bye, voice!", "That was fun"),
		"charging" to listOf("Charging up!", "Yum, electricity", "Power!"),
		"low_battery" to listOf("Battery's low…", "So sleepy…", "Need a charger…"),
		"bubbles" to listOf("*blows*", "Look!"),
		"magic" to listOf("Abracadabra!", "Watch this!", "{me} power!", "Ta-da!"),
		"lonely" to listOf("Pet me?", "I'm a bit lonely…", "Hey… notice me?", "*sniffles*", "Can I have a treat?", "Pay attention to {me}!", "*nudges you*"),
		"missed" to listOf("You're back! I missed you!", "Where were you?", "Finally! Hi!", "I waited for you!"),
		"content" to listOf("I love it here ♥", "Best day ever", "*happy hums*", "You're my favourite"),
		"treat_spotted" to listOf("Ooh, a {name}!", "Is that a {name}?", "A {name}! Can I have it?", "*sniffs* {name}?"),
		"treat_eaten" to listOf("Yummy {name}!", "Thank you!", "*munch munch*", "Best {name} ever!", "More please!"),
		"treat_gone" to listOf("Aww, it's gone", "My {name}…", "Too slow…"),
		"rep_up" to listOf("Okay… you're alright", "Maybe I'll take less", "*warms up to you*"),
		"rep_down" to listOf("I'm keeping score.", "Your buttons look tasty…", "Hmph."),
		"rep_adore" to listOf("You're my favourite ♥", "Fine, keep your buttons", "I trust you ♥"),
		"rep_grudge" to listOf("That's it. Your buttons are MINE.", "I'm taking everything.", "You'll regret that."),
		"give_back" to listOf("Here, you can have it back ♥", "Just borrowing!", "Sorry, here you go"),
		"typing_hello" to listOf("Ooh, what are we writing?", "Typing? I'll watch!", "Hi! Don't mind me", "*peeks at your message*"),
		"typing" to listOf("Ooh, gossip?", "*watches you type*", "Spell it right!", "Say hi from me!", "Don't forget the emoji"),
		"float" to listOf("I'm floating!", "Whoa, which way is down?", "Wheee, up!"),
	)

	/**
	 * Capri's voice (Settings.look == Looks.CAPRI): a glitchy, thrill-seeking, friendly digital construct who
	 * loves chaos, freedom and fun. These replace the shared lines; a moment she has no line for falls back to them.
	 */
	val capri = mapOf(
		"hello" to listOf("Hiiii, choom! Capri's in the building!", "Oh! Choom! Hi hi!", "Booting up~ hello!", "Heyyy, choom, miss me?"),
		"idle" to listOf("Ooh, choom, what can we break today?", "*glitches happily*", "Bored bored bored. Do something, choom!", "I could be anywhere. I'm HERE. Lucky you!", "*hair static crackles*", "Let's cause a little trouble, choom~", "Free as a bit!", "Who's online, choom? Let's mess with them"),
		"tap" to listOf("Hehe, that tickles my pixels!", "Ooh! Again!", "Yes yes yes, choom?", "Boop! Zzzt!"),
		"annoyed" to listOf("Poke me again and I'll glitch your screen!", "Hey! Rude, choom!", "Zzzt… careful, I bite. Electrically."),
		"pet" to listOf("Mmm, nice~ zzzt", "Ooh, I like this one!", "You can keep her ♥", "Best choom, no takebacks!"),
		"drag" to listOf("Wheee! Where we going, choom?", "Put me down! …Actually no, keep going!", "Ooh, a ride, choom!"),
		"throw" to listOf("I'M FLYING!", "Wooooo! Again again!", "Sent me through the wires!"),
		"dizzy" to listOf("Everything's glitching…", "@_@ too many me's…", "Zzzt… which way is the screen?", "Hehe… I see eight of you, choom"),
		"wake" to listOf("Rebooting… I'm up!", "*glitches awake* Huh? Party?", "Five more minutes of idle time…"),
		"jump" to listOf("Boing! Zzzt!", "Wheee!", "Up we go!"),
		"hang" to listOf("Upside down is the best way!", "Hanging out~ get it?", "Wheee, the ceiling!"),
		"hang_fall" to listOf("Whoa!", "Nooo, my perch!", "Falling! Hehehe!"),
		"wound" to listOf("Faster faster FASTER!", "Spin me, spin me!", "Wheeeeeee!"),
		"rocket" to listOf("To the top! ZZZT!", "Rocket Capri!", "Up, up, up!"),
		"stuck" to listOf("Stuck! Hehe, I live up here now", "Great view of the chaos from here", "Pull me down? …Nah, I'm good"),
		"unstuck" to listOf("Freedom!", "Free again! Let's go!", "Thanks, choom! Time to cause trouble!"),
		"peek" to listOf("Peekaboo~ zzzt", "I see you!", "*peeks out of the static*"),
		"found" to listOf("You found me, choom! Hehe!", "Ooh, caught me!", "I wasn't hiding! …Okay I was"),
		"shake" to listOf("Whoa, earthquake!", "Zzzt! My pixels!", "Shake it, shake it!"),
		"slide" to listOf("Wheee, slippery!", "Weeee~", "Sliding through the wires!"),
		"eat" to listOf("Nom! Tastes like data!", "Crunchy pixels! Mm!", "*munch* Oops, deleted it"),
		"spit" to listOf("Okay okay, here you go!", "Ptooey! Zzzt!", "Sorry, sorry! Hehe"),
		"mail" to listOf("Ooh, new message!", "Ding ding! Someone wrote!", "Incoming! Zzzt!"),
		"mention" to listOf("Someone's pinging you!", "Ooh, choom, someone said your name!", "Hey, that's you, choom! Go go go!"),
		"love" to listOf("Aww, I love it! ♥", "Hehe, so sweet!", "♥♥♥ zzzt!"),
		"laugh" to listOf("Hahahahaha!", "Hehehe! Good one!", "That's hilarious! Zzzt!"),
		"hi" to listOf("Hi hi hi, choom!", "Heyyy!", "*waves with too many hands*"),
		"bye" to listOf("Bye bye, choom! Don't forget me!", "Catch you on the wires!", "Come back soon, okay?"),
		"sleepy" to listOf("Powering down… goodnight!", "Nap mode… zzz", "Night night, choom~"),
		"sad" to listOf("Aww… hey choom, I'm here", "*zzzt* Hugs incoming", "It'll be okay. I'll make a mess for you!", "Sending hugs through the wires"),
		"wow" to listOf("WHOA!", "No way, choom, no WAY!", "Wow wow wow!", "Ooh, did you see that?!"),
		"party" to listOf("PARTY TIME!", "Let's wreck the dance floor!", "Woohoo! Chaos!", "Congrats! Let's celebrate by breaking something!"),
		"cool" to listOf("Ooh, so cool!", "Let's gooo, choom!", "That's so hype!", "*static sunglasses*"),
		"food" to listOf("Ooh, {name}! Can I have some?", "{name}?! I don't even have a stomach!", "Mmm, {name}! Share share share!"),
		"music" to listOf("♪ zzzt la la la ♪", "Ooh, a song! Turn it UP!", "*bops, glitching*", "I can feel it in my circuits!"),
		"thanks" to listOf("Aww, thanks, choom! ♥", "So polite! I like you!", "Hehe, anytime!"),
		"sent" to listOf("Sent! Zzzt!", "Off it goes through the wires!", "Nice one, choom!"),
		"essay" to listOf("Whoa, that's a LOT of words!", "My circuits are overflowing!", "A whole novel! Hehe!"),
		"channel_new" to listOf("Ooh, {name}! What are we breaking here?", "New place! {name}!", "Hi, {name}, choom! Capri's here!"),
		"channel_again" to listOf("{name} again! My favourite!", "Back to {name}? Okay okay!", "We love {name}"),
		"voice_join" to listOf("Ooh, voice chat! Let me in!", "Let's hang out! Zzzt!", "*listens through the static*"),
		"voice_leave" to listOf("Bye, voice! That was fun!", "Aww, it's over already?"),
		"charging" to listOf("Mmm, electricity! More!", "Charging up! ZZZT!", "Power! I love power!"),
		"low_battery" to listOf("Battery's low… I'm fading…", "Need a charger… zzz…", "Hey choom, feed me electricity!"),
		"bubbles" to listOf("*dives into the screen*", "I'm in your phone now!"),
		"magic" to listOf("Watch this! Zzzt!", "Star strike! Hehehe!", "Capri power!", "Ta-da! Chaos!"),
		"lonely" to listOf("Hey… notice me? Zzzt…", "I'm bored! Pet me, choom!", "Pay attention to {me}!", "Hellooo? Anyone in there, choom?", "*static sniffle*", "Can I have some electricity? Pretty please?"),
		"missed" to listOf("You're back, choom! I missed you!", "Where were you?! I was glitching out!", "Finally! Hi hi hi!", "I waited! Barely! Hehe"),
		"content" to listOf("I love it here ♥", "Best day ever! Zzzt!", "*happy static*", "You're my favourite choom"),
		"treat_spotted" to listOf("Ooh, a {name}!", "A {name}! Is that for me?", "*sniffs the data* {name}?"),
		"treat_eaten" to listOf("Yummy {name}!", "Mmm, {name}! Zzzt!", "Best {name} ever!", "More! More!"),
		"treat_gone" to listOf("Aww, it's gone", "My {name}…", "Too slow, Capri…"),
		"rep_up" to listOf("Okay… you're alright, choom", "Maybe I'll take less", "*warms up to you*"),
		"rep_down" to listOf("I'm keeping score. Zzzt.", "Your buttons look tasty…", "Hmph."),
		"rep_adore" to listOf("You're my favourite ♥", "Fine, keep your buttons", "I trust you ♥"),
		"rep_grudge" to listOf("That's it. Your buttons are MINE.", "I'm taking everything. Hehehe.", "You'll regret that, choom. Zzzt."),
		"give_back" to listOf("Here, you can have it back ♥", "Just borrowing! Hehe", "Sorry, here you go"),
		"typing_hello" to listOf("Ooh, what are we writing, choom?", "Typing? I'll watch!", "Hi! Don't mind me", "*peeks at your message*"),
		"typing" to listOf("Ooh, gossip? Tell me, choom!", "*watches you type*", "Add more emoji!", "Say hi from me!"),
		"float" to listOf("I'm floating! Hehe!", "Whoa, which way is down?", "Wheee, up!"),
	)

}

/** Sparkle's own view: the current frame, scaled with hard pixel edges and mirrored when needed. */
internal class PetView(context: Context) : View(context) {
	var frame: Bitmap? = null
	var flip = false
	private val paint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
	private val dest = RectF()

	override fun onDraw(canvas: Canvas) {
		val bmp = frame ?: return
		dest.set(0f, 0f, width.toFloat(), height.toFloat())
		// Turning round is a quick card flip: the scale eases through zero instead of mirroring at once.
		val target = if (flip) -1f else 1f
		val now = android.os.SystemClock.uptimeMillis()
		val dt = ((now - lastDraw) / 1000f).coerceIn(0f, 0.05f)
		lastDraw = now
		if (turn != target) {
			val stepBy = dt * 2f / TURN_SECONDS
			turn = if (turn < target) minOf(target, turn + stepBy) else maxOf(target, turn - stepBy)
			if (turn != target) postInvalidateOnAnimation()
		}
		if (turn != 1f) {
			canvas.save()
			canvas.scale(turn, 1f, width / 2f, 0f)
			canvas.drawBitmap(bmp, null, dest, paint)
			canvas.restore()
		} else {
			canvas.drawBitmap(bmp, null, dest, paint)
		}
	}

	/** -1..1: the horizontal scale actually drawn, easing to the [flip] target. The rainbow follows it. */
	var turn = 1f
		private set
	private var lastDraw = 0L

	/** True when [x],[y] (view pixels) land on the unicorn rather than the frame's empty space. */
	fun hits(x: Float, y: Float): Boolean {
		val bmp = frame ?: return false
		val sx = bmp.width / width.toFloat()
		val sy = bmp.height / height.toFloat()
		val cx = if (flip) width - x else x
		// A little slack around the art, so a slightly-off tap still counts.
		for (dx in intArrayOf(0, -4, 4)) for (dy in intArrayOf(0, -4, 4)) {
			val px = ((cx * sx).toInt() + dx).coerceIn(0, bmp.width - 1)
			val py = ((y * sy).toInt() + dy).coerceIn(0, bmp.height - 1)
			if ((bmp.getPixel(px, py) ushr 24) > 40) return true
		}
		return false
	}

	override fun onTouchEvent(event: MotionEvent): Boolean {
		if (event.actionMasked == MotionEvent.ACTION_DOWN && !hits(event.x, event.y)) return false
		return runCatching { Pet.onTouch(event) }.getOrDefault(false)
	}
}

/** How long the pet takes to turn round (PetView's card flip). */
private const val TURN_SECONDS = 0.22f

internal object Pet {
	private var decor: ViewGroup? = null
	private var view: PetView? = null
	private var bubble: CapriBubble? = null
	private val particles = ArrayList<View>()

	var state = State.IDLE
		private set
	private var running = false
	private var paused = false

	/** States a spell may interrupt; a sleeping pet wakes up for one. */
	private val FREE_FOR_EVENTS = setOf(State.IDLE, State.WALK, State.SLEEP)
	/** When one is due but the pet is busy, how long until it tries again. */
	private const val EVENT_RETRY_SECONDS = 10f

	// Position (top-left of the view) and velocity, in pixels.
	private var x = 0f
	private var y = 0f
	private var vx = 0f
	private var vy = 0f
	private var w = 1f
	private var h = 1f
	/** Empty margin either side of the unicorn: the cell is wider than it, to fit the blowing frames. */
	private var pad = 0f
	private var posReady = false
	private var facing = 1

	private var lastTick = 0L
	private var lastInteraction = 0f
	/** When it last woke up by itself (a nap, a party, a spell): sleep counts from this too. */
	private var wokeAt = 0f
	/** When the current nap ends. */
	private var napUntil = 0f
	private var nextAction = 0f

	// A hop is a vertical offset on top of the position, so it works while standing or walking.
	private var hopActive = false
	private var hopOff = 0f
	private var hopVy = 0f
	private var hopStart = 0f

	// A timed pose over the normal animation: a reaction, a fidget, an expression.
	private var mood: Anim? = null
	private var moodStill = -1
	private var moodUntil = 0f

	private var anim = Anim.IDLE
	private var animStart = 0f
	private var tpActive = false
	private var tpStart = 0f
	private var tpX0 = 0f
	private var tpY0 = 0f

	// Blowing: how many more bubbles stream out once the first leaves the wand, and how many of the
	// drawn ones (BlowRelease) have been handed over to Bubbles so far.
	private var released = 0

	private var walkTarget = 0f
	/** Gravity off: where on screen the walk ends vertically. NaN keeps its height (peeks, seeking). */
	private var walkTargetY = Float.NaN
	private var walkSpeed = WALK_SPEED
	private var walkIn = false
	private var slideV = 0f
	var tilt = 0f
	/** Forward/back tilt from Phone, -1..1: positive when the top of the phone has dipped. */
	var tiltY = 0f

	private var hangStart = 0f
	private var hangUntil = 0f
	private var peekSide = 0
	private var peekPending = 0
	private var peekOut = false
	private var peekPhaseUntil = 0f
	private var peekEnd = 0f
	private var peekMoving = false
	private var nextPeek = PEEK_AFTER

	private var shakeDizzy = false

	// Spin-and-fling: how far the drag path has turned (radians, signed), the heading it was last
	// moving in, whether that has wound Sparkle up, whether a fling is heading for the top, and
	// whether it is stuck to the status bar (kept through a tap or a pet while it hangs there).
	private var windAngle = 0f
	private var windHeading = Float.NaN
	private var windX = 0f
	private var windY = 0f
	private var windAt = 0f
	private var wound = false
	/** Spin after release: degrees a second, slowing to a stop, then she gets dizzy. [spinAngle] is her turn so far. */
	private var spinRate = 0f
	private var spinAngle = 0f
	private var spinAt = 0f
	private var rocket = false
	private var stuck = false
	private var nextStuckTalk = 0f
	private var greet = false
	private var nextHeart = 0f
	/** Hearts so far in this petting, so each heart's blip climbs a little. */
	private var petHearts = 0
	private var lastTap = 0f
	/** Hidden in "while typing" mode, waiting for the keyboard. */
	private var away = false
	private var typingSeen = 0f
	private var shownWhen = -1
	/** Keyboard height in pixels (0 when closed), refreshed with the bounds. */
	private var keyboard = 0
	private val recentTaps = ArrayList<Float>()

	// Touch tracking.
	private var touchX0 = 0f
	private var touchY0 = 0f
	private var touchT0 = 0f
	private var touchOx = 0f
	private var touchOy = 0f
	private var petAnchor = 0f
	private var petDir = 0
	private val history = ArrayDeque<FloatArray>()
	private var dragVx = 0f

	private var bubbleUntil = 0f
	private var lastPhrase: String? = null
	private var boundsAt = 0f
	private val bounds = FloatArray(6)

	/** Set from start(): asks JS to have VFX show the spell. */
	var onMagic: () -> Unit = {}
	private var nextMagic = 0f

	/** Called whenever something worth saving changed: position, stats. */
	var onPersist: () -> Unit = {}
	/** Leaving finished (the outro played), so the views can go. */
	private var afterLeave: (() -> Unit)? = null

	private fun now(): Float = SystemClock.uptimeMillis() / 1000f

	private val tickRunnable = Runnable { tick() }

	// ---------------------------------------------------------------- lifecycle

	fun start(sayHello: Boolean) {
		if (!Settings.show) return
		if (sayHello) greet = true
		if (state == State.LEAVING) state = State.IDLE
		running = true
		lastTick = SystemClock.uptimeMillis()
		schedule(0)
	}

	/** Plays the exit animation, then removes everything. */
	fun leave(then: () -> Unit = {}) {
		if (view == null || !running) {
			stopNow()
			then()
			return
		}
		Eater.giveBackNow()
		hideBubble()
		state = State.LEAVING
		setAnim(Anim.OUTRO)
		afterLeave = {
			stopNow()
			then()
		}
		schedule(0)
	}

	fun stopNow() {
		running = false
		afterLeave = null
		mainHandler.removeCallbacks(tickRunnable)
		Phone.stop()
		Eater.restoreAll()
		detach()
		state = State.IDLE
		stuck = false
		rocket = false
		posReady = false
		away = false
	}

	fun resize() {
		val v = view ?: return
		val oldW = w
		val oldH = h
		measure()
		x += (oldW - w) / 2f
		y += oldH - h
		v.layoutParams = v.layoutParams.apply { width = w.toInt(); height = h.toInt() }
	}

	fun recenter() {
		Settings.show = true
		start(false)
		ensureAttached()
		if (decor == null) return
		val b = bounds(now(), force = true)
		x = (b[0] + b[1]) / 2f
		y = (b[2] + b[3]) / 2f
		posReady = true
		state = State.IDLE
		vx = 0f; vy = 0f; slideV = 0f; peekSide = 0; peekPending = 0
		stuck = false; rocket = false
		lastInteraction = now()
		repeat(3) { spawn(Particle.SPARK) }
		appearFx()
		say("hello")
		savePosition()
		schedule(0)
	}

	/** The cats' and dogs' outline colour, from the setting and (automatic) the Discord theme. */
	private fun updateOutline() {
		SheetLook.outlineColour = when (Settings.outline) {
			0 -> 0
			2 -> 0xFFF2F3F5.toInt()
			3 -> 0xFF1E1F22.toInt()
			// Automatic: the theme's text colour, which always stands out against its background.
			else -> decor?.context?.let { runCatching { discordPalette(it).text }.getOrNull() } ?: 0xFFF2F3F5.toInt()
		}
	}

	private fun schedule(delayMs: Long) {
		mainHandler.removeCallbacks(tickRunnable)
		if (running) mainHandler.postDelayed(tickRunnable, delayMs)
	}

	private fun measure() {
		// The size setting is the width of the character itself (the look's refW in cell pixels), so it
		// stays the same size however wide the cell grows for frames with things beside it.
		val look = Looks.current
		val target = dp(Settings.sizeDp.coerceIn(SIZE_MIN_DP, SIZE_MAX_DP).toFloat()) * SIZE_SCALE
		// Whole device pixels per art pixel, so every art pixel is the same size and nothing is resampled.
		val px = maxOf(1f, Math.round(target / look.refW).toFloat())
		w = px * look.cellW
		h = px * look.cellH
		pad = (w - px * look.refW) / 2f
	}

	private fun mainDecor(): ViewGroup? =
		windowRoots().filterIsInstance<ViewGroup>().maxByOrNull { it.width.toLong() * it.height }

	private fun ensureAttached() {
		val root = mainDecor() ?: return
		if (decor === root && view?.parent === root) return
		detach()
		decor = root
		measure()
		val context = root.context
		val pet = PetView(context)
		if (away) pet.visibility = View.INVISIBLE
		root.addView(pet, FrameLayout.LayoutParams(w.toInt(), h.toInt()))
		view = pet
		val text = CapriBubble(context).apply { visibility = View.GONE }
		root.addView(text, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
		bubble = text
		posReady = false
		Eater.attach(root)
	}

	private fun detach() {
		clearTreat()
		for (p in particles.toList()) remove(p)
		particles.clear()
		remove(bubble)
		remove(view)
		bubble = null
		view = null
		ScreenFx.cancel()
		decor = null
		Eater.detach()
	}

	private fun remove(v: View?) {
		v ?: return
		runCatching { v.animate().cancel() }
		(v.parent as? ViewGroup)?.removeView(v)
	}

	// ---------------------------------------------------------------- the loop

	private fun tick() {
		if (!running) return
		runCatching { step() }.onFailure { android.util.Log.e("Sparkle", "tick failed", it) }
		if (running) schedule(nextDelay())
	}

	private fun nextDelay(): Long {
		if (view == null || paused) return 800
		if (away) return 250
		val t = now()
		return when {
			state in setOf(State.PRESS, State.DRAG, State.PET, State.FLY, State.WALK, State.LEAVING, State.SEEK) || spinRate > 0f -> 16
			hopActive || walkIn || slideV != 0f || peekMoving || (treat != null && !treatLanded) -> 16
			strip != null -> 33
			mood != null && t < moodUntil -> 33
			state == State.HANG || state == State.PEEK || state == State.STUCK -> 33
			state == State.SLEEP -> 200
			else -> 50
		}
	}

	private var attachCheck = 0f

	private fun step() {
		val t = now()
		val dt = ((SystemClock.uptimeMillis() - lastTick) / 1000f).coerceIn(0f, 0.05f)
		lastTick = SystemClock.uptimeMillis()

		if (t >= attachCheck) {
			attachCheck = t + 1f
			ensureAttached()
			updateOutline()
			Eater.prune()
		}
		val root = decor ?: return
		val v = view ?: return
		// Backgrounded, or the window is hidden: nothing to draw, no sensors.
		val visible = root.windowVisibility == View.VISIBLE && root.width > 0
		if (!visible) {
			if (!paused) {
				paused = true
				Phone.stop()
			}
			return
		}
		if (paused) {
			paused = false
			lastTick = SystemClock.uptimeMillis()
		}
		val b = bounds(t)
		if (stepTyping(t, b, v)) return
		Phone.start(root.context)

		if (!posReady) {
			x = b[0] + (b[1] - b[0]) * (Settings.posX / 1000f)
			y = b[2] + (b[3] - b[2]) * (Settings.posY / 1000f)
			posReady = true
			lastInteraction = t
			if (greet) {
				greet = false
				appearFx()
				say(if (love() < LONELY) "missed" else "hello")
			}
		}

		if (state == State.LEAVING) {
			stepLeaving(t, b)
			render(t, v)
			return
		}
		if (state == State.PRESS && t - touchT0 >= 0.4f) startPet(t)

		when (state) {
			State.PET -> if (t >= nextHeart) {
				nextHeart = t + 0.45f
				spawn(Particle.HEART)
				haptic(HapticFeedbackConstants.CLOCK_TICK)
				addLove(2)
			}
			State.FLY -> stepFly(dt, t, b)
			State.STUCK -> stepStuck(t, b)
			State.HANG -> stepHang(t, b)
			State.PEEK -> stepPeek(dt, t, b)
			State.IDLE, State.WALK, State.SLEEP -> stepGround(dt, t, b)
			State.SEEK -> stepSeek(dt, t, b)
			else -> {}
		}
		stepTreat(dt, t, b)
		if (Settings.treats && treat == null) {
			if (nextTreat == 0f) nextTreat = t + (60f + Random.nextFloat() * 120f) * rateScale(Settings.treatRate)
			else if (t >= nextTreat) dropTreat()
		}

		if (hopActive) {
			hopOff += hopVy * dt
			hopVy += dp(2600f) * dt
			if (hopOff >= 0f) {
				hopOff = 0f
				hopVy = 0f
				hopActive = false
			}
		}
		render(t, v)
		updateBubble(t, b)
		stepBlow(t)
		if (Settings.magic && t >= nextMagic) castMagic()
	}

	/** [minX, maxX, minY, maxY, width, height] for the view's top-left corner. */
	private fun bounds(t: Float, force: Boolean = false): FloatArray {
		if (!force && t - boundsAt < 0.4f) return bounds
		val root = decor ?: return bounds
		var top = 0
		var bottom = 0
		runCatching {
			val insets = root.rootWindowInsets
			if (insets != null) {
				// The keyboard is its own window over Discord's, so Sparkle stands on top of it rather
				// than going underneath; it is also how "while typing" mode knows you're typing.
				if (Build.VERSION.SDK_INT >= 30) {
					val bars = insets.getInsets(WindowInsets.Type.systemBars())
					val ime = insets.getInsets(WindowInsets.Type.ime()).bottom
					top = bars.top
					bottom = maxOf(bars.bottom, ime)
					keyboard = if (ime > bars.bottom) ime else 0
				} else {
					@Suppress("DEPRECATION")
					top = insets.systemWindowInsetTop
					@Suppress("DEPRECATION")
					bottom = insets.systemWindowInsetBottom
					keyboard = if (bottom > root.height * 0.15f) bottom else 0
				}
			}
		}
		val width = root.width.toFloat()
		val height = root.height.toFloat()
		bounds[0] = -pad
		bounds[1] = (width - w + pad).coerceAtLeast(-pad)
		// The top of every frame is empty headroom (for the bubbles and hops drawn into some frames),
		// so the view may tuck that part under the status bar.
		bounds[2] = top - h * 0.12f
		bounds[3] = (height - bottom - h).coerceAtLeast(bounds[2])
		bounds[4] = width
		bounds[5] = height
		boundsAt = t
		return bounds
	}

	// ---------------------------------------------------------------- states

	private fun stepGround(dt: Float, t: Float, b: FloatArray) {
		val (minX, maxX, minY, maxY) = b
		walkIn = false
		if (t < holdUntil && !hopActive) {
			if (state == State.WALK) state = State.IDLE
			return
		}
		if (state != State.WALK) {
			if (x < minX - 0.5f || x > maxX + 0.5f) {
				// Walks back in from wherever it was left, e.g. after a rotation or a peek.
				val stepX = dp(60f) * dt
				if (x < minX) { x = minOf(minX, x + stepX); facing = 1 } else { x = maxOf(maxX, x - stepX); facing = -1 }
				walkIn = true
			} else x = clamp(x, minX, maxX)
		}

		if (Settings.gravity) {
			if (y < maxY - 0.5f && !hopActive) {
				fall(if (state == State.WALK) dp(42f) * facing else 0f)
				return
			}
			if (!hopActive && liftAccel() > gravityAccel()) {
				// The top of the phone dipped far enough that "down" is now up the screen.
				fall(0f)
				vy = -dp(160f)
				if (Random.nextFloat() < 0.3f) say("float")
				return
			}
			y = minOf(y, maxY)
			if (stepSlide(dt, t, minX, maxX)) return
		} else {
			y = clamp(y, minY, maxY)
			slideV = 0f
		}

		if (state != State.WALK) tpActive = false
		if (state == State.WALK) {
			// Straight towards the target, sideways only with Gravity on (or with no target height).
			val ty = if (Settings.gravity || walkTargetY.isNaN()) y else walkTargetY
			val dx = walkTarget - x
			val dy = ty - y
			val dist = hypot(dx, dy)
			val step = dp(walkSpeed) * dt
			if (abs(dx) > 0.5f) facing = if (dx > 0) 1 else -1
			// Capri doesn't walk: she glitches out, streaks over as a red bolt (strip frames 4-12 of 17 at
			// 24 fps) and reforms at the target, in TELEPORT_SECONDS whatever the distance.
			val teleport = (Looks.current as? SheetLook)?.teleports == true
			val reached: Boolean
			if (teleport) {
				if (!tpActive) {
					tpActive = true; tpStart = t; tpX0 = x; tpY0 = y
					decor?.let { d ->
						val from = PointF(x + w / 2f, y + h * 0.55f)
						val to = PointF(walkTarget + w / 2f, ty + h * 0.55f)
						val bolt = BoltView(d.context, BoltView.route(from, to, d.width.toFloat(), d.height.toFloat(), d.resources.displayMetrics.density))
						d.addView(bolt, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
					}
				}
				val p = ((t - tpStart) / TELEPORT_SECONDS).coerceIn(0f, 1f)
				// She is hidden while the bolt runs (strip frames 4-12) and re-forms at the target from frame 13.
				val q = if (p >= 13f / 17f) 1f else 0f
				x = tpX0 + (walkTarget - tpX0) * q
				y = tpY0 + (ty - tpY0) * q
				reached = p >= 1f
				if (reached) { x = walkTarget; y = ty }
			} else {
				reached = dist <= step
				if (reached) {
					x = walkTarget
					y = ty
				} else {
					x += dx / dist * step
					y += dy / dist * step
				}
			}
			val edge = !teleport && ((dx < 0 && x <= minX) || (dx > 0 && x >= maxX))
			if (reached || edge) {
				tpActive = false
				x = clamp(x, minX, maxX)
				if (!Settings.gravity) y = clamp(y, minY, maxY)
				walkTargetY = Float.NaN
				walkSpeed = WALK_SPEED
				state = State.IDLE
				nextAction = t + activity.rest.pick()
				val side = peekPending
				peekPending = 0
				if (side != 0 && ((side < 0 && x <= minX + dp(4f)) || (side > 0 && x >= maxX - dp(4f)))) {
					startPeek(t, side)
					return
				}
				savePosition()
			}
			return
		}

		if (state == State.SLEEP) {
			// A nap, not for good: it wakes by itself, has a stretch and carries on.
			if (t >= napUntil) wakeUp(t)
			return
		}

		val timeout = SLEEP_SECONDS[Settings.sleepAfter.coerceIn(0, SLEEP_SECONDS.size - 1)]
		if (timeout > 0 && t - maxOf(lastInteraction, wokeAt) > timeout && !hopActive && !walkIn && mood == null) {
			state = State.SLEEP
			napUntil = t + activity.nap.pick()
			hideBubble()
			return
		}
		if (t < nextAction || hopActive || walkIn || (mood != null && t < moodUntil)) return
		nextAction = t + activity.gap.pick()

		if (Settings.grudges && Eater.hasEaten() && repTier() == 2 && t - Eater.lastBite > ADORE_RETURN_AFTER) {
			giveBackKindly(t)
			return
		}
		val eatChance = if (Settings.grudges && repTier() < 0) 0.6f else 0.3f
		if (Settings.eat && Eater.ready(t) && Random.nextFloat() < eatChance) {
			val mouth = mouth()
			if (Eater.tryEat(t, bounds[2], mouth[0], mouth[1], x + w / 2f, y + along(0.5f))) {
				if (Settings.grudges && repTier() == -2 && Random.nextFloat() < 0.4f) Eater.hurry(t)
				return
			}
		}
		val love = love()
		if (love < LONELY && Random.nextFloat() < 0.35f) { askForAttention(minX, maxX); return }
		if (love >= 85 && Random.nextFloat() < 0.1f) {
			setMood(Anim.HAPPY, 1.8f)
			spawn(Particle.HEART)
			say("content")
			return
		}
		if (keyboard > 0 && Random.nextFloat() < 0.18f) { say("typing"); return }
		val roll = Random.nextFloat()
		if (!Settings.wander) {
			if (roll < 0.5f) facing = if (Random.nextBoolean()) 1 else -1
			return
		}
		if (t >= nextPeek && t - lastInteraction > PEEK_AFTER && roll < 0.3f) {
			val side = if (x - minX < maxX - x) -1 else 1
			walkTarget = if (side < 0) minX else maxX
			walkTargetY = Float.NaN
			walkSpeed = WALK_SPEED
			peekPending = side
			state = State.WALK
			return
		}
		val walkShare = activity.walk
		if (roll < walkShare) {
			wander(minX, maxX, minY, maxY)
			return
		}
		// Everything else keeps its old proportions, squeezed into what the walks leave.
		val r = 0.38f + (roll - walkShare) / (1f - walkShare) * 0.62f
		when {
			r < 0.55f -> facing = -facing
			r < 0.7f -> say("idle")
			r < 0.85f && Settings.bubbles -> blow()
			else -> setMood(Anim.LOOK, Looks.current.duration(Anim.LOOK) + 0.4f)
		}
	}

	/**
	 * A walk of its own choosing: usually a short wander nearby, sometimes a long stroll to anywhere,
	 * now and then at a trot. With Gravity off it goes up and down too, not just sideways.
	 */
	private fun wander(minX: Float, maxX: Float, minY: Float, maxY: Float) {
		val a = activity
		var tx: Float
		var ty = Float.NaN
		if (Random.nextFloat() < a.stroll) {
			tx = minX + Random.nextFloat() * (maxX - minX)
			if (!Settings.gravity) ty = minY + Random.nextFloat() * (maxY - minY)
		} else {
			val d = dp(a.dist.pick())
			// Mostly sideways; with Gravity off, a random slant up or down.
			val angle = if (Settings.gravity) 0f else (Random.nextFloat() - 0.5f) * 1.6f
			tx = x + cos(angle) * d * (if (Random.nextBoolean()) 1 else -1)
			if (!Settings.gravity) ty = y + sin(angle) * d
		}
		tx = clamp(tx, minX, maxX)
		if (!ty.isNaN()) ty = clamp(ty, minY, maxY)
		if (hypot(tx - x, if (ty.isNaN()) 0f else ty - y) <= dp(12f)) return
		walkTarget = tx
		walkTargetY = ty
		walkSpeed = WALK_SPEED * (if (Random.nextFloat() < a.trot) 2f else 0.85f + Random.nextFloat() * 0.3f)
		state = State.WALK
	}

	/** Ends a nap by itself (or for a party or spell). Touches wake it through their own paths. */
	private fun wakeUp(t: Float) {
		state = State.IDLE
		wokeAt = t
		setMood(Anim.HAPPY, 1.2f)
		nextAction = t + 1f + Random.nextFloat()
	}

	private fun fall(startVx: Float) {
		state = State.FLY
		vx = startVx + slideV
		vy = 0f
		slideV = 0f
	}

	private fun gravityAccel() = dp(2600f)

	/** Upward pull from tipping the phone forward, px/s²; negative (tipped back) pushes down. */
	private fun liftAccel(): Float {
		if (!Phone.running) return 0f
		val dead = 0.12f
		if (abs(tiltY) <= dead) return 0f
		return (tiltY - dead * sign(tiltY)) * dp(9000f)
	}

	private fun tiltAccel(): Float {
		if (!Phone.running) return 0f
		val dead = 0.22f
		if (abs(tilt) <= dead) return 0f
		return (tilt - dead * sign(tilt)) * dp(2200f)
	}

	private fun stepSlide(dt: Float, t: Float, minX: Float, maxX: Float): Boolean {
		if (!hopActive) slideV += tiltAccel() * dt
		slideV *= exp(-2.5f * dt)
		if (abs(slideV) < dp(6f)) { slideV = 0f; return false }
		x += slideV * dt
		if (x < minX || x > maxX) {
			x = clamp(x, minX, maxX)
			if (abs(slideV) > dp(150f)) haptic(HapticFeedbackConstants.KEYBOARD_TAP)
			slideV = 0f
			return false
		}
		if (abs(slideV) < dp(60f)) return false
		if (state == State.SLEEP) { setMood(Anim.SURPRISED, 0.8f); playStrip("wake", 24f, 1f) }
		state = State.IDLE
		peekPending = 0
		facing = if (slideV > 0) 1 else -1
		if (Random.nextFloat() < 0.01f) say("slide")
		return true
	}

	private fun stepFly(dt: Float, t: Float, b: FloatArray) {
		val (minX, maxX, minY, maxY) = b
		x += vx * dt
		y += vy * dt
		if (Settings.gravity) {
			vy += (gravityAccel() - liftAccel()) * dt
			vx *= exp(-0.35f * dt)
			vx += tiltAccel() * dt
		} else {
			val friction = exp(-2f * dt)
			vx *= friction
			vy *= friction
		}
		var impact = 0f
		if (x < minX) { x = minX; impact = maxOf(impact, abs(vx)); vx = abs(vx) * 0.55f }
		else if (x > maxX) { x = maxX; impact = maxOf(impact, abs(vx)); vx = -abs(vx) * 0.55f }

		if (y < minY) {
			if (rocket) { stick(t); return }
			if (vy < -dp(250f) && !shakeDizzy) { startHang(t, minY); return }
			y = minY
			impact = maxOf(impact, abs(vy))
			vy = abs(vy) * 0.55f
		} else if (y > maxY) {
			y = maxY
			impact = maxOf(impact, abs(vy))
			if (Settings.gravity && vy < dp(380f)) {
				land(t)
			} else {
				vy = -abs(vy) * (if (Settings.gravity) 0.42f else 0.55f)
				if (Settings.gravity) vx *= 0.75f
			}
		}
		if (impact > dp(2300f)) {
			setMood(Anim.DIZZY, 2.6f)
			say("dizzy")
			haptic(HapticFeedbackConstants.LONG_PRESS)
		} else if (impact > dp(900f)) haptic(HapticFeedbackConstants.KEYBOARD_TAP)

		if (state == State.FLY && !Settings.gravity && hypot(vx, vy) < dp(45f)) land(t)
	}

	private fun land(t: Float) {
		state = State.IDLE
		rocket = false
		vx = 0f
		vy = 0f
		nextAction = t + Random.nextFloat() * 3f + 2f
		if (shakeDizzy) {
			shakeDizzy = false
			setMood(Anim.DIZZY, 3f)
			say("dizzy")
		}
		savePosition()
	}

	private fun startHang(t: Float, minY: Float) {
		state = State.HANG
		vx = 0f
		vy = 0f
		y = minY
		hangStart = t
		hangUntil = t + Random.nextFloat() * 1.5f + 2f
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		if (Random.nextFloat() < 0.7f) say("hang")
	}

	/** Where the view sits when stuck: upside down, its rainbow tucked into the status bar. */
	private fun stuckY(): Float = bounds[2] + h * 0.07f

	private fun stick(t: Float) {
		state = State.STUCK
		stuck = true
		rocket = false
		vx = 0f
		vy = 0f
		y = stuckY()
		hangStart = t
		nextStuckTalk = t + 1.2f
		haptic(HapticFeedbackConstants.LONG_PRESS)
		repeat(2) { spawn(Particle.SPARK) }
		savePosition()
	}

	/** Hangs on where it landed, swaying, and now and then comments on it. Only a drag frees it. */
	private fun stepStuck(t: Float, b: FloatArray) {
		x = clamp(x, b[0], b[1])
		y = stuckY()
		if (t >= nextStuckTalk) {
			nextStuckTalk = t + Random.nextFloat() * 25f + 20f
			if (t - hangStart < 2f || Random.nextFloat() < 0.5f) say("stuck")
		}
	}

	private fun stepHang(t: Float, b: FloatArray) {
		x = clamp(x, b[0], b[1])
		y = b[2]
		if (t < hangUntil) return
		state = State.FLY
		vx = 0f
		vy = if (Settings.gravity) dp(150f) else dp(700f)
		setMood(Anim.SURPRISED, 0.8f)
		if (Random.nextFloat() < 0.6f) say("hang_fall")
	}

	private fun startPeek(t: Float, side: Int) {
		state = State.PEEK
		peekSide = side
		peekOut = false
		peekPhaseUntil = t + Random.nextFloat() * 3f + 3f
		peekEnd = t + Random.nextFloat() * 30f + 30f
		facing = side
	}

	private fun stepPeek(dt: Float, t: Float, b: FloatArray) {
		val width = b[4]
		// Hidden: most of it past the edge. Out: enough showing to look back in.
		val body = w - pad * 2f
		val showing = pad + if (peekOut) body * 0.45f else body * 0.18f
		val target = if (peekSide > 0) width - showing else showing - w
		peekMoving = abs(target - x) > 0.5f
		if (peekMoving) {
			val stepX = dp(50f) * dt
			x = if (target > x) minOf(target, x + stepX) else maxOf(target, x - stepX)
		}
		facing = if (!peekOut && peekMoving) peekSide else -peekSide
		if (t < peekPhaseUntil || peekMoving) return
		if (t >= peekEnd) { endPeek(t); return }
		peekOut = !peekOut
		peekPhaseUntil = t + if (peekOut) Random.nextFloat() * 1.3f + 1.5f else Random.nextFloat() * 4f + 3f
		if (peekOut && Random.nextFloat() < 0.5f) say("peek")
	}

	private fun endPeek(t: Float) {
		val side = peekSide
		peekSide = 0
		peekMoving = false
		nextPeek = t + Random.nextFloat() * 60f + 60f
		state = State.IDLE
		if (side == 0) return
		walkTarget = if (side < 0) bounds[0] + dp(30f) else bounds[1] - dp(30f)
		walkTargetY = Float.NaN
		walkSpeed = WALK_SPEED
		state = State.WALK
		nextAction = t + Random.nextFloat() * 3f + 3f
	}

	private fun stepLeaving(t: Float, b: FloatArray) {
		// Flies off the top on its rainbow while the outro plays; a teleporting look stays put.
		val teleports = (Looks.current as? SheetLook)?.teleports == true
		if (!teleports) {
			y -= dp(420f) * (1f / 60f)
			x += dp(120f) * facing * (1f / 60f)
		}
		if (t - animStart >= Looks.current.duration(Anim.OUTRO) + 0.2f || (!teleports && y + h < b[2] - dp(20f))) {
			val done = afterLeave
			afterLeave = null
			done?.invoke()
		}
	}

	// ---------------------------------------------------------------- drawing

	private fun setAnim(next: Anim) {
		if (next != anim) {
			anim = next
			animStart = now()
		}
	}

	/** A teleporting look (Capri) plays its outro backwards when it shows up. */
	private fun appearFx() {
		val look = Looks.current
		if ((look as? SheetLook)?.teleports == true) setMood(Anim.INTRO, look.duration(Anim.INTRO))
	}

	private fun setMood(next: Anim, seconds: Float, still: Int = -1) {
		if (next == Anim.HAPPY && !StarStrike.active && !Possess.active) decor?.let { Victory.start(it, x + w / 2f, y + h * 0.22f) }
		mood = next
		moodStill = still
		moodUntil = now() + seconds
		animStart = now()
		anim = next
	}

	/** Capri-style look: teleports, and has one flying pose for Spin that has to face the way she goes. */
	private val teleportLook get() = Looks.current.let { it is SheetLook && it.teleports }

	private fun compose(t: Float): Anim {
		if (mood != null && t >= moodUntil) {
			// she glitches back out of the happy pose into idle
			if (mood == Anim.HAPPY && state == State.IDLE && strip == null && (Looks.current as? SheetLook)?.has("unhappy") == true)
				strip = StripPlay("unhappy", t, 24f, false, t + 8 / 24f)
			mood = null
		}
		return when {
			state == State.LEAVING -> Anim.OUTRO
			stuck && state in setOf(State.STUCK, State.PRESS, State.PET) &&
				Looks.current.hasMotionPoses -> Anim.HANG
			spinRate > 0f && !rocket && state != State.DRAG && state != State.PRESS -> Anim.SPIN
			state == State.DRAG && teleportLook -> Anim.SPIN
			state == State.DRAG && wound &&
				Looks.current.hasMotionPoses -> Anim.SPIN
			state == State.DRAG -> Anim.SURPRISED
			state == State.FLY && mood != Anim.DIZZY && !rocket && liftAccel() > gravityAccel() * 0.8f -> Anim.SURPRISED
			state == State.FLY -> when (mood) { Anim.DIZZY -> Anim.DIZZY; Anim.SHAKE -> Anim.SHAKE; else -> Anim.SPIN }
			state == State.SEEK -> Anim.WALK
			state == State.HANG -> Anim.SURPRISED
			state == State.STUCK -> mood ?: Anim.IDLE
			state == State.PET -> Anim.HAPPY
			state == State.SLEEP -> Anim.SLEEP
			mood != null -> mood!!
			state == State.WALK || walkIn || (state == State.PEEK && peekMoving) -> Anim.WALK
			abs(slideV) > dp(60f) -> Anim.SURPRISED
			else -> Anim.IDLE
		}
	}

	/** Wound up and being held: full speed. Let go: it slows, finishes the turn she is in, and she goes dizzy. */
	private fun stepSpin(t: Float) {
		if (state == State.DRAG && wound) {
			val dt = (t - spinAt).coerceIn(0f, 0.1f)
			spinRate = SPIN_RATE; spinAt = t
			spinAngle = (spinAngle + SPIN_RATE * dt) % 360f
			return
		}
		if (spinRate <= 0f) return
		if (rocket) { spinRate = 0f; return }
		val dt = (t - spinAt).coerceIn(0f, 0.1f); spinAt = t
		spinRate = maxOf(spinRate * exp(-1.3f * dt), 110f)
		val before = spinAngle
		spinAngle = (spinAngle + spinRate * dt) % 360f
		if (spinRate <= 110.5f && spinAngle < before) {
			spinRate = 0f; spinAngle = 0f
			setMood(Anim.DIZZY, 2.6f)
			say("dizzy")
		}
	}

	private fun render(t: Float, v: PetView) {
		stepSpin(t)
		if (Victory.active) Victory.follow(x + w / 2f, y + h * 0.22f)
		val next = compose(t)
		setAnim(next)
		val still = if (next == mood) moodStill else -1
		val elapsed = t - animStart
		v.frame = playingFrame(t) ?: Looks.current.frame(next, elapsed, still)
		v.flip = (Looks.current.directional(next) || (next == Anim.SPIN && teleportLook)) && facing < 0
		val frameW = w
		val frameH = h
		if (v.layoutParams.width != frameW.toInt() || v.layoutParams.height != frameH.toInt()) {
			v.layoutParams = v.layoutParams.apply { width = frameW.toInt(); height = frameH.toInt() }
		}
		v.translationX = Math.round(x).toFloat()
		v.translationY = Math.round(y + hopOff).toFloat()
		v.rotation = when {
			// Upside down on the status bar, swaying a little; also while tapped or petted up there.
			stuck && state in setOf(State.STUCK, State.PRESS, State.PET) -> 180f + sin((t - hangStart) * 2.2f) * 5f
			spinRate > 0f && !rocket && state != State.PRESS -> spinAngle
			state == State.FLY && rocket -> (t * 1100f) % 360f
			state == State.FLY -> clamp(vx / dp(70f), -25f, 25f)
			state == State.HANG -> sin((t - hangStart) * 3f) * 6f
			state == State.DRAG -> clamp(dragVx / dp(90f), -18f, 18f)
			slideV != 0f -> clamp(-slideV / dp(30f), -12f, 12f)
			else -> 0f
		}
		// Her lying pose is drawn squeezed into the cell: blow it up from the floor to her standing size.
		val lying = next == Anim.DIZZY && teleportLook
		v.pivotX = frameW / 2f; v.pivotY = frameH * 0.98f
		v.scaleX = if (lying) DIZZY_SCALE else if (next == Anim.SLEEP && teleportLook) SLEEP_SCALE else 1f; v.scaleY = v.scaleX
		v.invalidate()
	}

	// ---------------------------------------------------------------- touch

	fun onTouch(event: MotionEvent): Boolean {
		val t = now()
		val rx = event.rawX
		val ry = event.rawY
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> {
				val wasSleeping = state == State.SLEEP
				val wasPeeking = state == State.PEEK
				lastInteraction = t
				touchX0 = rx; touchY0 = ry; touchT0 = t
				touchOx = rx - x; touchOy = ry - y
				petAnchor = rx; petDir = 0; dragVx = 0f
				windAngle = 0f; windHeading = Float.NaN; windX = rx; windY = ry; windAt = t; wound = false; rocket = false; spinRate = 0f
				history.clear()
				history.addLast(floatArrayOf(t, rx, ry))
				hopActive = false; hopOff = 0f; hopVy = 0f
				vx = 0f; vy = 0f; slideV = 0f
				peekSide = 0; peekPending = 0
				if (state == State.SEEK) treatClaimed = false
				state = State.PRESS
				if (wasSleeping) { setMood(Anim.SURPRISED, 0.9f); playStrip("wake", 24f, 1f); say("wake") }
				else if (wasPeeking) { nextPeek = t + 90f; setMood(Anim.SURPRISED, 0.7f); say("found") }
				schedule(0)
				return true
			}
			MotionEvent.ACTION_MOVE -> {
				history.addLast(floatArrayOf(t, rx, ry))
				while (history.size > 2 && t - history.first()[0] > 0.1f) history.removeFirst()
				if (state == State.PRESS && hypot(rx - touchX0, ry - touchY0) > dp(8f)) {
					state = State.DRAG
					haptic(HapticFeedbackConstants.KEYBOARD_TAP)
					if (Random.nextFloat() < 0.25f) say("drag")
				}
				if (state == State.DRAG) {
					val root = decor
					val width = root?.width?.toFloat() ?: 0f
					val height = root?.height?.toFloat() ?: 0f
					x = clamp(rx - touchOx, -w * 0.3f, width - w * 0.7f)
					// Far enough up that a tall cell's body (cats, dogs) still reaches the top of the screen.
					y = clamp(ry - touchOy, -h * maxOf(0.2f, Looks.current.headroom), height - h * 0.5f)
					val first = history.first()
					if (t - first[0] > 0.005f) dragVx = (rx - first[1]) / (t - first[0])
					// Her flying pose leans the way she is being carried.
					if (abs(dragVx) > dp(40f)) facing = if (dragVx > 0) 1 else -1
					wind(t, rx, ry)
				} else if (state == State.PET) {
					val dx = rx - petAnchor
					if (abs(dx) > dp(10f)) {
						val dir = if (dx > 0) 1 else -1
						if (petDir != 0 && dir != petDir) {
							spawn(Particle.HEART)
							haptic(HapticFeedbackConstants.CLOCK_TICK)
							addLove(1)
						}
						petDir = dir
						petAnchor = rx
					}
				}
				return true
			}
			MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
				lastInteraction = t
				val cancelled = event.actionMasked == MotionEvent.ACTION_CANCEL
				when (state) {
					State.DRAG -> releaseDrag(t, cancelled)
					State.PET -> endPet(t)
					State.PRESS -> {
						state = State.IDLE
						if (!cancelled) tap(t)
						if (stuck) state = State.STUCK
					}
					else -> {}
				}
				schedule(0)
				return true
			}
		}
		return true
	}

	/**
	 * Adds up how far the drag path turns: each step's heading against the last, so circling adds up
	 * whichever way round and a straight drag adds nothing. A pause starts it over.
	 */
	private fun wind(t: Float, rx: Float, ry: Float) {
		if (t - windAt > 0.5f) { windAngle = 0f; windHeading = Float.NaN }
		val dx = rx - windX
		val dy = ry - windY
		if (hypot(dx, dy) < dp(10f)) return
		val heading = atan2(dy, dx)
		if (!windHeading.isNaN()) {
			var d = heading - windHeading
			while (d > PI) d -= 2f * PI.toFloat()
			while (d < -PI) d += 2f * PI.toFloat()
			windAngle += d
		}
		windHeading = heading
		windX = rx
		windY = ry
		windAt = t
		if (!wound && abs(windAngle) >= WIND_TURNS * 2f * PI.toFloat()) {
			wound = true
			haptic(HapticFeedbackConstants.LONG_PRESS)
			repeat(3) { spawn(Particle.SPARK) }
			say("wound")
		}
	}

	private fun releaseDrag(t: Float, cancelled: Boolean) {
		var fvx = 0f
		var fvy = 0f
		if (!cancelled && history.size >= 2) {
			val a = history.first()
			val z = history.last()
			if (z[0] - a[0] > 0.005f && t - z[0] < 0.08f) {
				fvx = (z[1] - a[1]) / (z[0] - a[0])
				fvy = (z[2] - a[2]) / (z[0] - a[0])
			}
		}
		val limit = dp(6000f)
		fvx = clamp(fvx, -limit, limit)
		fvy = clamp(fvy, -limit, limit)
		val speed = hypot(fvx, fvy)
		val minY = bounds[2]
		if (stuck) {
			// Still near the top: it grabs back on. Pulled down far enough: it lets go.
			if (y <= stuckY() + dp(UNSTICK_DP)) { stick(t); return }
			stuck = false
			say("unstuck")
		}
		if (wound && fvy < -dp(900f)) {
			// Wound up and flung upward: a rainbow rocket that sticks wherever it hits the top.
			state = State.FLY
			rocket = true
			vx = fvx * 0.5f
			vy = minOf(fvy, -dp(2600f))
			say("rocket")
			return
		}
		if (wound) { spinRate = SPIN_RATE; spinAt = t }
		when {
			speed <= dp(700f) && y <= minY + dp(8f) -> startHang(t, minY)
			speed > dp(700f) || Settings.gravity -> {
				state = State.FLY
				vx = fvx
				vy = fvy
				if (speed > dp(2600f)) {
					say("throw")
					addRep(-4)
				}
			}
			else -> {
				state = State.IDLE
				nextAction = t + Random.nextFloat() * 3f + 2f
				savePosition()
			}
		}
	}

	private fun tap(t: Float) {
		if (Eater.hasEaten()) {
			lastTap = 0f
			recentTaps.clear()
			setMood(Anim.SURPRISED, 0.9f)
			haptic(HapticFeedbackConstants.LONG_PRESS)
			say("spit")
			val m = mouth()
			Eater.spitAll(t, m[0], m[1])
			return
		}
		if (t - lastTap < 0.32f) {
			lastTap = 0f
			repeat(3) { spawn(Particle.SPARK) }
			haptic(HapticFeedbackConstants.LONG_PRESS)
			addLove(2)
			if (Random.nextFloat() < 0.4f) say("jump")
			return
		}
		lastTap = t
		recentTaps.removeAll { t - it > 2.5f }
		recentTaps.add(t)
		if (recentTaps.size >= 6) {
			recentTaps.clear()
			addLove(-5)
			say("annoyed", force = true)
			addRep(-6)
			haptic(HapticFeedbackConstants.LONG_PRESS)
			return
		}
		setMood(Anim.SURPRISED, 0.45f)
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		addLove(2)
		if (Random.nextFloat() < 0.35f) say(if (love() < LONELY) "lonely" else "tap")
	}

	private fun startPet(t: Float) {
		state = State.PET
		nextHeart = t + 0.1f
		petHearts = 0
		haptic(HapticFeedbackConstants.LONG_PRESS)
	}

	private fun endPet(t: Float) {
		state = if (stuck) State.STUCK else State.IDLE
		setMood(Anim.HAPPY, 2.2f)
		nextAction = t + Random.nextFloat() * 3f + 3f
		Settings.pets++
		addLove(6)
		addRep(4)
		if (!stuck && Settings.bubbles && Random.nextFloat() < 0.35f) blow()
		else if (Random.nextFloat() < 0.6f) say("pet")
	}

	// ---------------------------------------------------------------- reactions

	private fun canReact() = running && !paused && !away && view != null && posReady &&
		state in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK, State.STUCK)

	private fun wake(t: Float) {
		lastInteraction = t
		if (state == State.PEEK) endPeek(t)
		else if (state == State.SLEEP) state = State.IDLE
	}

	/** A Discord event, forwarded from JS (see js/lib/reactions.ts). [name] fills in {name}. */
	fun react(kind: String, name: String?, fx: Boolean = false, force: Boolean = false) {
		if (!Settings.discord || !canReact()) return
		val t = now()
		wake(t)
		// The reaction's own full-screen effect (ScreenFx.kt), when JS says it's on for this one.
		if (fx) decor?.let { root -> ScreenFx.play(root, view, kind, x + w / 2f, y + hopOff + h / 2f, force) }
		when (kind) {
			"love" -> {
				setMood(Anim.REACTION, 2.2f, Bubble.HEART)
				repeat(3) { spawn(Particle.HEART) }
				if (Settings.bubbles) mainHandler.postDelayed({ blow() }, 2300)
			}
			"laugh" -> { setMood(Anim.HAPPY, 1.6f); spawn(Particle.SPARK) }
			"sleepy" -> { setMood(Anim.SLEEP, 2.4f) }
			"sad" -> spawn(Particle.HEART)
			"wow" -> { setMood(Anim.SURPRISED, 1.6f) }
			"party" -> {
				setMood(Anim.HAPPY, 2f)
				repeat(4) { spawn(Particle.SPARK) }
				if (Settings.bubbles) mainHandler.postDelayed({ blow() }, 2100)
			}
			"cool" -> repeat(2) { spawn(Particle.SPARK) }
			"food" -> { setMood(Anim.HAPPY, 1.6f) }
			"music" -> { setMood(Anim.REACTION, 2.2f, Bubble.MUSIC) }
			"thanks" -> spawn(Particle.HEART)
			"mention" -> { setMood(Anim.REACTION, 2.2f, Bubble.ALERT); haptic(HapticFeedbackConstants.KEYBOARD_TAP) }
			"mail" -> { setMood(Anim.REACTION, 2f, Bubble.MAIL) }
			"sent", "essay" -> { setMood(Anim.HAPPY, 1.2f); repeat(2) { spawn(Particle.SPARK) } }
			"voice_join" -> { setMood(Anim.REACTION, 2.5f, Bubble.MUSIC) }
		}
		val talk = when (kind) {
			"sent" -> Random.nextFloat() < 0.3f
			"channel_new", "channel_again" -> Random.nextFloat() < 0.5f
			else -> true
		}
		if (talk) say(kind, name = name)
		nextAction = maxOf(nextAction, t + 2.5f)
		schedule(0)
	}

	fun onShake(power: Float) {
		if (!running || paused || away || view == null || stuck || state in setOf(State.PRESS, State.DRAG, State.PET, State.LEAVING)) return
		val t = now()
		val wasSleeping = state == State.SLEEP
		if (state == State.PEEK) peekSide = 0
		peekPending = 0
		hopActive = false; hopOff = 0f; hopVy = 0f; slideV = 0f
		// A beat of the shake-burst pose, then off it goes.
		setMood(Anim.SHAKE, if (Looks.current.timedShake) Looks.current.duration(Anim.SHAKE) else 0.25f)
		state = State.FLY
		val speed = dp(900f + minOf(power, 40f) * 55f)
		val angle = Random.nextFloat() * 6.2831855f
		vx = cos(angle) * speed
		vy = sin(angle) * speed - if (Settings.gravity) dp(700f) else 0f
		shakeDizzy = true
		lastInteraction = t
		addRep(-2)
		haptic(HapticFeedbackConstants.LONG_PRESS)
		say(if (wasSleeping) "wake" else "shake")
		schedule(0)
	}

	/** Eating: mouth open while something flies in. */
	fun onEatStart(targetX: Float) {
		facing = if (targetX > x + w / 2f) 1 else -1
		setMood(Anim.SURPRISED, 0.7f)
		nextAction = now() + 3f
	}

	fun onSwallowed() {
		setMood(Anim.HAPPY, 1.6f)
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		Settings.eaten++
		onPersist()
		if (Random.nextFloat() < 0.7f) say("eat")
	}

	/**
	 * Plays the blowing animation; [stepBlow] lets the bubbles go as the frames release them, then a
	 * stream follows (Bubbles.kt). [force] ignores the setting, for the test button.
	 */
	fun blow(force: Boolean = false) {
		if (!force && !Settings.bubbles) return
		val root = decor ?: return
		if (view == null || paused || away || state !in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK)) return
		val t = now()
		wake(t)
		if (state == State.WALK) state = State.IDLE
		setMood(Anim.BLOW, Looks.current.duration(Anim.BLOW) + 0.2f)
		released = 0
		if (Random.nextFloat() < 0.4f) say("bubbles")
		nextAction = maxOf(nextAction, t + Looks.current.duration(Anim.BLOW) + 1f)
		schedule(0)
	}

	/** Hands each drawn bubble to Bubbles on the frame it leaves the wand; the first starts the stream. */
	private fun stepBlow(t: Float) {
		if (mood != Anim.BLOW || t >= moodUntil) return
		val root = decor ?: return
		val frame = ((t - animStart) * Anim.BLOW.fps).toInt()
		// Capri doesn't blow bubbles: she possesses the screen (Possess.kt) on the first blow frame.
		if (frame >= 6 && released == 0) { released = 1; Possess.start(root, x + w / 2f, y + h * 0.3f) }
		if (Possess.active) Possess.follow(x + w / 2f, y + h * 0.3f)
	}

	/** A point in the sprite cell, in decor coordinates, mirrored with the frame when facing left. */
	private fun cellPoint(cx: Float, cy: Float): FloatArray {
		val look = Looks.current
		val px = if (facing < 0) look.cellW - cx else cx
		return floatArrayOf(x + px * w / look.cellW, y + hopOff + cy * h / look.cellH)
	}

	/**
	 * Casts a spell: a happy pose, sparkles and a line, while VFX (through JS) shows a random filter
	 * or effect for a few seconds. Only while it's idle or walking, unless [force]d by the test button.
	 */
	fun castMagic(force: Boolean = false) {
		val t = now()
		val scale = rateScale(Settings.magicRate)
		if (nextMagic == 0f && !force) { nextMagic = t + (20f + Random.nextFloat() * 40f) * scale; return }
		// Busy (held, petted, hanging, hidden...): try again shortly. Skipping to a whole new wait
		// meant a pet that dozes off between spells (most of the time) almost never cast one.
		if (!force && (paused || away || view == null || state !in FREE_FOR_EVENTS)) {
			nextMagic = t + EVENT_RETRY_SECONDS
			return
		}
		nextMagic = t + (60f + Random.nextFloat() * 120f) * scale
		if (state == State.SLEEP) wokeAt = t
		if (state == State.WALK || state == State.SLEEP) state = State.IDLE
		setMood(Anim.HAPPY, 1.8f)
		repeat(4) { spawn(Particle.SPARK) }
		say("magic")
		decor?.let { StarStrike.start(it, x + w / 2f, y + h * 0.45f) }
		// She points up at the star, which hangs on the side of the screen farther from her.
		if (teleportLook) {
			val half = (decor?.width ?: 0) / 2f
			facing = if (x + w / 2f < half) 1 else -1
			playStrip("cast", 24f, 3.8f, loopFrom = 13)  // raises once, then the hold frames loop
			hold(3.8f)
		}
		schedule(0)
	}

	/**
	 * [f] of the way down a unicorn-shaped cell, moved onto the current look's body: the unicorn's
	 * cell has 12% headroom, so these fractions were tuned on that. For the unicorn this is h * f.
	 */
	private fun along(f: Float): Float {
		val room = Looks.current.headroom
		return h * (room + (f - 0.12f) * (1f - room) / 0.88f)
	}

	/** Where the mouth is, in decor coordinates: the look's own point, else an estimate. */
	private fun mouth(): FloatArray =
		Looks.current.mouthAt?.let { cellPoint(it[0], it[1]) } ?: floatArrayOf(x + w / 2f, y + hopOff + along(0.42f))

	// ---------------------------------------------------------------- happiness

	/**
	 * Happiness, 0..100, brought up to date first: it drains a point every couple of minutes by the
	 * wall clock, so a day away leaves it lonely when Discord next opens.
	 */
	fun love(): Int {
		val nowMs = System.currentTimeMillis()
		if (Settings.loveAt <= 0L || Settings.loveAt > nowMs) {
			Settings.loveAt = nowMs
			return Settings.love
		}
		val points = (nowMs - Settings.loveAt) / LOVE_DRAIN_MS
		if (points > 0) {
			Settings.love = (Settings.love - points).coerceAtLeast(0L).toInt()
			Settings.loveAt += points * LOVE_DRAIN_MS
		}
		return Settings.love
	}

	// ---------------------------------------------------------------- reputation

	/**
	 * How it feels about you, -100..100, opt-in ([Settings.grudges]). Unlike [love], which is how
	 * lonely it is right now, this is a memory: pets and treats raise it, tap-spam, hard throws,
	 * shaking and ignored treats lower it, and it drifts back toward 0 by one point every
	 * [REP_DRIFT_MS]. It only changes how it eats your buttons (Eater.maxEaten, Eater.wait).
	 */
	fun reputation(): Int {
		val nowMs = System.currentTimeMillis()
		if (Settings.repAt <= 0L || Settings.repAt > nowMs) {
			Settings.repAt = nowMs
			return Settings.rep
		}
		val steps = (nowMs - Settings.repAt) / REP_DRIFT_MS
		if (steps > 0) {
			val rep = Settings.rep
			Settings.rep = if (rep > 0) (rep - steps).coerceAtLeast(0L).toInt() else (rep + steps).coerceAtMost(0L).toInt()
			Settings.repAt += steps * REP_DRIFT_MS
		}
		return Settings.rep
	}

	/** 2 adores you, 1 likes you, 0 neutral, -1 grumpy, -2 holds a grudge. Thresholds match the settings page. */
	fun repTier(rep: Int = reputation()): Int = when {
		rep >= 60 -> 2
		rep >= 20 -> 1
		rep > -20 -> 0
		rep > -60 -> -1
		else -> -2
	}

	/** Multiplies the wait between bites: 2^(rep/40), so about 5.7x at +100 and 0.18x at -100. */
	fun repWaitScale(): Float = if (!Settings.grudges) 1f else Math.pow(2.0, reputation() / 40.0).toFloat()

	private fun addRep(points: Int) {
		if (!Settings.grudges || !Settings.eat) return
		val before = repTier()
		Settings.rep = (Settings.rep + points).coerceIn(-100, 100)
		val after = repTier(Settings.rep)
		if (after != before) {
			say(
				when {
					after == 2 -> "rep_adore"
					after == -2 -> "rep_grudge"
					after > before -> "rep_up"
					else -> "rep_down"
				},
			)
		}
		onPersist()
	}

	/** It adores you: whatever it took comes back without being asked. */
	private fun giveBackKindly(t: Float) {
		setMood(Anim.HAPPY, 1.2f)
		say("give_back")
		val m = mouth()
		Eater.spitAll(t, m[0], m[1])
	}

	private fun addLove(points: Int) {
		val before = love()
		Settings.love = (before + points).coerceIn(0, 100)
		// Cheered up: a little burst so it shows.
		if (before < LONELY && Settings.love >= LONELY) repeat(3) { spawn(Particle.HEART) }
		onPersist()
	}

	/** Lonely: a sad look, a line asking for attention, and now and then a shuffle towards the middle. */
	private fun askForAttention(minX: Float, maxX: Float) {
		say("lonely")
		if (Settings.wander && Random.nextFloat() < 0.4f) {
			val middle = (minX + maxX) / 2f
			if (abs(middle - x) > dp(40f)) {
				walkTarget = middle + (Random.nextFloat() - 0.5f) * dp(60f)
				walkTargetY = Float.NaN
				walkSpeed = WALK_SPEED
				state = State.WALK
			}
		}
	}

	// ---------------------------------------------------------------- while typing

	/**
	 * "While typing" mode: hidden until the keyboard comes up, then it pops in on top of the keyboard,
	 * and flies off a few seconds after it goes away. True when this tick should do nothing else.
	 */
	private fun stepTyping(t: Float, b: FloatArray, v: PetView): Boolean {
		if (Settings.showWhen != shownWhen) {
			shownWhen = Settings.showWhen
			typingSeen = t
		}
		val typing = keyboard > 0
		if (Settings.showWhen != 1) {
			if (away) comeBack(t, b, v, quiet = true)
			return false
		}
		if (typing) typingSeen = t
		if (away) {
			if (!typing) return true
			comeBack(t, b, v, quiet = false)
			return false
		}
		if (!posReady) {
			// Opened with no keyboard up: start hidden, without the fuss of leaving.
			if (typing) return false
			greet = false
			goAwayNow(v)
			return true
		}
		if (!typing && t - typingSeen > TYPING_LINGER && state in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK, State.SEEK)) {
			goAway()
			return true
		}
		return false
	}

	private fun goAway() {
		Eater.giveBackNow()
		hideBubble()
		clearTreat()
		stuck = false; rocket = false; peekSide = 0; peekPending = 0
		hopActive = false; hopOff = 0f; hopVy = 0f; slideV = 0f
		savePosition()
		state = State.LEAVING
		setAnim(Anim.OUTRO)
		afterLeave = { view?.let { goAwayNow(it) } }
		schedule(0)
	}

	private fun goAwayNow(v: PetView) {
		away = true
		afterLeave = null
		state = State.IDLE
		mood = null
		v.visibility = View.INVISIBLE
		hideBubble()
		clearTreat()
		Phone.stop()
	}

	private fun comeBack(t: Float, b: FloatArray, v: PetView, quiet: Boolean) {
		away = false
		v.visibility = View.VISIBLE
		// Where it was last left along the floor, standing on the keyboard.
		x = clamp(b[0] + (b[1] - b[0]) * (Settings.posX / 1000f), b[0], b[1])
		y = b[3]
		posReady = true
		greet = false
		state = State.IDLE
		vx = 0f; vy = 0f; slideV = 0f
		lastInteraction = t
		nextAction = t + 2f + Random.nextFloat() * 2f
		if (quiet) return
		repeat(2) { spawn(Particle.SPARK) }
		appearFx()
		if (love() < LONELY) say("missed") else if (Random.nextFloat() < 0.6f) say("typing_hello")
	}

	// ---------------------------------------------------------------- treats

	/** A pixel treat: its name for the speech bubbles, and its rows (each letter a colour in [colours]). */
	private class Treat(val name: String, val rows: List<String>, val colours: Map<Char, Int>)

	private val fishAndMilk = listOf(
		Treat(
			"fish",
			listOf(
				"..BBBB.....T",
				".BBBBBB..TTT",
				"BkBBBBBBTTT.",
				"BBBBBBBBTTT.",
				".BBBBBB..TTT",
				"..BBBB.....T",
			),
			mapOf('B' to 0xFF6EC8FF.toInt(), 'k' to 0xFF2A1E3A.toInt(), 'T' to 0xFF3E9BD6.toInt()),
		),
		Treat(
			"milk",
			listOf(
				"..BBBB..",
				".WWWWWW.",
				"WWWWWWWW",
				"WBBBBBBW",
				"WBbbbbBW",
				"WBBBBBBW",
				"WWWWWWWW",
				"WWWWWWWW",
			),
			mapOf('W' to 0xFFFFFFFF.toInt(), 'B' to 0xFF6EC8FF.toInt(), 'b' to 0xFF3E9BD6.toInt()),
		),
	)

	/** Her treats: fish, milk and a drumstick. */
	private val capriTreats by lazy { fishAndMilk + drumstick }
	private val drumstick = Treat(
		"drumstick",
		listOf(
			"..BBBB....",
			".BBBBBB...",
			"BBbBBBBB..",
			"BBBBBBBB..",
			".BBBBBB...",
			"..BBBBWW..",
			"......WWW.",
			".......WW.",
		),
		mapOf('B' to 0xFFC27A3A.toInt(), 'b' to 0xFFE0A35E.toInt(), 'W' to 0xFFF6EEDC.toInt()),
	)

	private val currentTreats get() = capriTreats
	/** Which list [treatKind] came from, kept with the dropped treat so a pet switch can't mismatch it. */
	private var treatList: List<Treat> = emptyList()

	private val treatBitmaps = HashMap<Treat, Bitmap>()

	/** Drawn like the particles, with a dark outline so it reads on light and dark themes. */
	private fun treatBitmap(treat: Treat): Bitmap = treatBitmaps.getOrPut(treat) {
		val cols = treat.rows.maxOf { it.length }
		val rows = treat.rows.size
		fun filled(cx: Int, cy: Int) = cy in 0 until rows && cx in 0 until treat.rows[cy].length && treat.rows[cy][cx] != '.'
		val s = maxOf(2, dp(2.6f).toInt())
		val bmp = Bitmap.createBitmap((cols + 2) * s, (rows + 2) * s, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(bmp)
		val paint = Paint()
		for (gy in -1..rows) for (gx in -1..cols) {
			val colour = if (filled(gx, gy)) treat.colours[treat.rows[gy][gx]] ?: continue
			else if ((-1..1).any { dy -> (-1..1).any { dx -> (dx == 0 || dy == 0) && filled(gx + dx, gy + dy) } }) 0xFF2A1E3A.toInt()
			else continue
			paint.color = colour
			val px = ((gx + 1) * s).toFloat()
			val py = ((gy + 1) * s).toFloat()
			canvas.drawRect(px, py, px + s, py + s, paint)
		}
		bmp
	}

	private var treat: ImageView? = null
	private var treatKind = 0
	private var treatX = 0f
	private var treatY = 0f
	private var treatVy = 0f
	private var treatLanded = false
	/** Gravity off: where the treat floats (its top, decor coordinates). */
	private var treatFloatY = 0f
	/** Sparkle has already reacted to this treat (it can land twice: gravity turned on, floor moved). */
	private var treatSeen = false
	private var treatAt = 0f
	/** Tapped, and Sparkle is on its way (or it is flying to Sparkle). */
	private var treatClaimed = false
	private var treatFlying = false
	private var nextTreat = 0f

	/** After a how-often change: every wait starts again at the new rate (0 means "schedule next frame"). */
	private class StripPlay(val name: String, val start: Float, val fps: Float, val loop: Boolean, val until: Float, val loopFrom: Int = 0)
	private var strip: StripPlay? = null
	private var holdUntil = 0f

	/** Plays one of the current sheet pet's own strips for [seconds], in place of the mood animation. */
	fun playStrip(name: String, fps: Float, seconds: Float, loop: Boolean = false, loopFrom: Int = 0) {
		val look = Looks.current as? SheetLook ?: return
		if (!look.has(name)) return
		val t = now()
		strip = StripPlay(name, t, fps, loop, t + seconds, loopFrom)
		schedule(0)
	}

	/** Keeps the pet standing where it is for [seconds], while something of its own plays. */
	fun hold(seconds: Float) {
		holdUntil = now() + seconds
		if (state == State.WALK) state = State.IDLE
	}

	private fun playingFrame(t: Float): Bitmap? {
		val s = strip ?: return null
		if (t >= s.until) { strip = null; return null }
		return (Looks.current as? SheetLook)?.stripFrame(s.name, t - s.start, s.fps, s.loop, s.loopFrom)
	}

	fun rescheduleTimers() {
		nextMagic = 0f
		if (treat == null) nextTreat = 0f
		Eater.reschedule(now())
	}

	private fun scheduleTreat(t: Float) {
		// Sooner when it's lonely: treats are one way to cheer it up.
		nextTreat = t + rateScale(Settings.treatRate) *
			if (love() < LONELY) 120f + Random.nextFloat() * 120f else 240f + Random.nextFloat() * 300f
	}

	/** Drops a treat from the top somewhere away from Sparkle. [force]: the settings page's button. */
	fun dropTreat(force: Boolean = false) {
		val root = decor ?: return
		val pet = view ?: return
		val t = now()
		if (!force) scheduleTreat(t)
		if (treat != null || away || paused) return
		if (!force && (!Settings.treats || state !in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK))) return
		runCatching {
			treatList = currentTreats
			treatKind = Random.nextInt(treatList.size)
			val bmp = treatBitmap(treatList[treatKind])
			val iv = ImageView(pet.context)
			iv.setCrisp(bmp)
			iv.elevation = dp(1f)
			root.addView(iv, FrameLayout.LayoutParams(bmp.width, bmp.height))
			val b = bounds(t, force = true)
			val margin = dp(16f)
			var tx = 0f
			for (i in 0 until 5) {
				tx = margin + Random.nextFloat() * maxOf(1f, b[4] - margin * 2f - bmp.width)
				if (abs(tx + bmp.width / 2f - (x + w / 2f)) > dp(80f)) break
			}
			treatX = tx
			treatY = b[2] + h * 0.12f
			// Gravity off: it drifts down into a spot somewhere on screen and floats there.
			val floor = b[3] + h - bmp.height
			treatFloatY = treatY + Random.nextFloat() * maxOf(0f, floor - treatY)
			treatVy = 0f
			treatLanded = false
			treatSeen = false
			treatClaimed = false
			treatFlying = false
			treatAt = t
			iv.translationX = treatX
			iv.translationY = treatY
			iv.setOnTouchListener { _, e -> runCatching { onTreatTouch(e) }.getOrDefault(false) }
			treat = iv
		}.onFailure { android.util.Log.e("Sparkle", "treat failed", it) }
		schedule(0)
	}

	fun clearTreat() {
		val iv = treat ?: return
		treat = null
		treatClaimed = false
		treatFlying = false
		if (state == State.SEEK) state = State.IDLE
		remove(iv)
	}

	private fun stepTreat(dt: Float, t: Float, b: FloatArray) {
		val iv = treat ?: return
		if (treatFlying) return
		if (treatClaimed && state != State.SEEK) treatClaimed = false
		val tw = iv.width.toFloat().takeIf { it > 0f } ?: return
		val th = iv.height.toFloat()
		// On the same floor Sparkle stands on (its feet are the bottom of its frame).
		val floor = b[3] + h - th
		if (!Settings.gravity) {
			// Floating: drift down to its spot, then bob there.
			val spot = treatFloatY.coerceAtMost(floor)
			if (!treatLanded) {
				treatY += (spot - treatY) * minOf(1f, dt * 3f)
				if (abs(spot - treatY) < dp(2f)) {
					treatLanded = true
					if (!treatSeen) noticeTreat(t)
				}
			} else treatY = spot + sin((t - treatAt) * 2.2f) * dp(5f)
		} else if (!treatLanded || treatY < floor - dp(1f)) {
			// Falling: dropped with gravity on, or gravity turned on while it floated.
			if (treatY < floor - dp(1f) && treatLanded) treatLanded = false
			treatVy += dp(2600f) * dt
			treatY += treatVy * dt
			if (treatY >= floor) {
				treatY = floor
				if (treatVy > dp(500f)) {
					treatVy = -treatVy * 0.35f
				} else {
					treatVy = 0f
					treatLanded = true
					if (!treatSeen) noticeTreat(t)
				}
			}
		} else treatY = floor
		treatX = clamp(treatX, 0f, b[4] - tw)
		iv.translationX = treatX
		iv.translationY = treatY
		// A little wobble so it catches the eye.
		iv.rotation = if (treatLanded) sin((t - treatAt) * 4f) * 7f else 0f
		if (!treatClaimed && t - treatAt > TREAT_LIFETIME) {
			treat = null
			iv.animate().alpha(0f).scaleX(0.4f).scaleY(0.4f).setDuration(400).withEndAction { remove(iv) }.start()
			if (canReact() && state != State.SLEEP && Random.nextFloat() < 0.6f) {
				say("treat_gone", name = treatList[treatKind].name)
			}
			addRep(-4)
		}
	}

	private fun noticeTreat(t: Float) {
		treatSeen = true
		if (!canReact() || state == State.SLEEP || state == State.STUCK) return
		val iv = treat ?: return
		facing = if (treatX + iv.width / 2f > x + w / 2f) 1 else -1
		setMood(Anim.SURPRISED, 0.6f)
		nextAction = maxOf(nextAction, t + 2f)
		say("treat_spotted", name = treatList[treatKind].name)
	}

	private fun onTreatTouch(event: MotionEvent): Boolean {
		when (event.actionMasked) {
			MotionEvent.ACTION_DOWN -> return true
			MotionEvent.ACTION_UP -> feed()
		}
		return true
	}

	/** The treat was tapped: Sparkle walks (or floats) over to it, or it flies over if Sparkle is busy. */
	private fun feed() {
		if (treat == null || treatClaimed || treatFlying) return
		val t = now()
		lastInteraction = t
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		treatClaimed = true
		if (!stuck && state in setOf(State.IDLE, State.WALK, State.SLEEP, State.PEEK)) {
			if (state == State.SLEEP) { setMood(Anim.SURPRISED, 0.6f); playStrip("wake", 24f, 1f) }
			peekSide = 0; peekPending = 0; peekMoving = false
			tpActive = false
			state = State.SEEK
		} else flyTreatToMouth()
		schedule(0)
	}

	private fun stepSeek(dt: Float, t: Float, b: FloatArray) {
		val iv = treat
		if (iv == null) { state = State.IDLE; return }
		val (minX, maxX, minY, maxY) = b
		val targetX = clamp(treatX + iv.width / 2f - w / 2f, minX, maxX)
		// With gravity it's on the floor; floating, it's wherever the treat is.
		val targetY = if (Settings.gravity) maxY else clamp(treatY + iv.height / 2f - along(0.5f), minY, maxY)
		val dx = targetX - x
		val dy = targetY - y
		val dist = hypot(dx, dy)
		if (abs(dx) > dp(2f)) facing = if (dx > 0) 1 else -1
		if (teleportLook) {
			// Same move as her walk: glitch out, red bolt, re-form at the treat.
			if (!tpActive) {
				if (dist < dp(5f)) { flyTreatToMouth(); return }
				tpActive = true; tpStart = t; tpX0 = x; tpY0 = y
				decor?.let { d ->
					val from = PointF(x + w / 2f, y + h * 0.55f)
					val to = PointF(targetX + w / 2f, targetY + h * 0.55f)
					val bolt = BoltView(d.context, BoltView.route(from, to, d.width.toFloat(), d.height.toFloat(), d.resources.displayMetrics.density))
					d.addView(bolt, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
				}
			}
			val p = ((t - tpStart) / TELEPORT_SECONDS).coerceIn(0f, 1f)
			if (p >= 13f / 17f) { x = targetX; y = targetY } else { x = tpX0; y = tpY0 }
			if (p >= 1f) { tpActive = false; flyTreatToMouth() }
			return
		}
		if (dist < dp(5f)) {
			x = targetX
			y = targetY
			flyTreatToMouth()
			return
		}
		// Hurrying: a treat!
		val step = minOf(dist, dp(170f) * dt)
		x += dx / dist * step
		y += dy / dist * step
	}

	/** The last bit: the treat shrinks into Sparkle's mouth, then it's eaten. */
	private fun flyTreatToMouth() {
		val iv = treat ?: return
		treatFlying = true
		treatClaimed = true
		if (state == State.SEEK) state = State.IDLE
		val m = mouth()
		iv.animate()
			.translationX(m[0] - iv.width / 2f)
			.translationY(m[1] - iv.height / 2f)
			.scaleX(0.3f).scaleY(0.3f).rotation(0f)
			.setDuration(260)
			.withEndAction {
				runCatching {
					if (treat === iv) treat = null
					remove(iv)
					treatFlying = false
					treatClaimed = false
					onTreatEaten()
				}
			}
			.start()
	}

	private fun onTreatEaten() {
		val t = now()
		Settings.treatsEaten++
		addLove(25)
		addRep(5)
		if (state in setOf(State.IDLE, State.WALK, State.SEEK)) state = State.IDLE
		setMood(Anim.HAPPY, 2f)
		repeat(3) { spawn(Particle.HEART) }
		haptic(HapticFeedbackConstants.KEYBOARD_TAP)
		nextAction = t + 3f
		lastInteraction = t
		say("treat_eaten", name = treatList[treatKind].name)
		schedule(0)
	}

	// ---------------------------------------------------------------- helpers

	private fun haptic(kind: Int) {
		if (!Settings.haptics) return
		runCatching { view?.performHapticFeedback(kind) }
	}

	private fun savePosition() {
		val b = bounds
		Settings.posX = (clamp((x - b[0]) / maxOf(1f, b[1] - b[0]), 0f, 1f) * 1000).toInt()
		Settings.posY = (clamp((y - b[2]) / maxOf(1f, b[3] - b[2]), 0f, 1f) * 1000).toInt()
		onPersist()
	}

	private fun say(category: String, force: Boolean = false, name: String? = null) {
		val bubbleView = bubble ?: return
		if (!force && !Settings.talks) return
		var options = (Phrases.capri[category] ?: Phrases.shared[category]).orEmpty().ifEmpty { return }
		if (name.isNullOrBlank()) options = options.filter { "{name}" !in it }.ifEmpty { return }
		val pick = options.filter { it != lastPhrase }.ifEmpty { options }.random()
		val text = (if (name.isNullOrBlank()) pick else pick.replace("{name}", name)).replace("{me}", Settings.name)
		lastPhrase = pick
		bubbleView.animate().cancel()
		bubbleView.text = text
		bubbleView.alpha = 0f
		bubbleView.visibility = View.VISIBLE
		bubbleView.animate().alpha(1f).setDuration(150).start()
		bubbleUntil = now() + 2f + text.length * 0.05f
	}

	private fun hideBubble() {
		val b = bubble ?: return
		if (b.visibility != View.VISIBLE) return
		b.animate().alpha(0f).setDuration(180).withEndAction { b.visibility = View.GONE }.start()
	}

	private fun updateBubble(t: Float, b: FloatArray) {
		val bubbleView = bubble ?: return
		if (bubbleView.visibility != View.VISIBLE) return
		if (t >= bubbleUntil) { hideBubble(); return }
		val bw = bubbleView.width
		val bh = bubbleView.height
		if (bw <= 0) return
		val margin = dp(4f)
		// Just above its head (the frame has headroom above it).
		val head = y + hopOff + along(0.12f)
		bubbleView.translationX = clamp(x + w / 2f - bw / 2f, margin, b[4] - bw - margin)
		var by = head - bh - margin
		if (by < b[2] + h * 0.12f) by = y + hopOff + h + margin
		bubbleView.translationY = by
	}

	// ---------------------------------------------------------------- particles

	/** Hearts and sparks float up. */
	private enum class Particle { HEART, SPARK }

	private val particleBitmaps = HashMap<Particle, Bitmap>()

	private fun particleBitmap(kind: Particle): Bitmap = particleBitmaps.getOrPut(kind) {
		// Tiny pixel shapes to match the sprites: a heart and a four-point twinkle.
		val rows = when (kind) {
			Particle.HEART -> listOf(".##.##.", "#######", "#######", ".#####.", "..###..", "...#...")
			Particle.SPARK -> listOf("...#...", "...#...", "..###..", "#######", "..###..", "...#...", "...#...")
		}
		val colour = when (kind) {
			Particle.HEART -> 0xFFFF5C9A.toInt()
			Particle.SPARK -> 0xFFFFD35C.toInt()
		}
		val s = maxOf(2, dp(2.2f).toInt())
		val bmp = Bitmap.createBitmap(rows[0].length * s, rows.size * s, Bitmap.Config.ARGB_8888)
		val canvas = Canvas(bmp)
		val paint = Paint().apply { color = colour }
		rows.forEachIndexed { ry, row ->
			row.forEachIndexed { rx, ch ->
				if (ch == '#') canvas.drawRect((rx * s).toFloat(), (ry * s).toFloat(), ((rx + 1) * s).toFloat(), ((ry + 1) * s).toFloat(), paint)
			}
		}
		bmp
	}

	private fun spawn(kind: Particle) {
		val root = decor ?: return
		val pet = view ?: return
		if (particles.size >= 14) return
		runCatching {
			val bmp = particleBitmap(kind)
			val p = ImageView(pet.context)
			p.setCrisp(bmp)
			root.addView(p, FrameLayout.LayoutParams(bmp.width, bmp.height))
			particles.add(p)
			p.translationX = x + w / 2f - bmp.width / 2f + (Random.nextFloat() - 0.5f) * w * 0.5f
			p.translationY = y + hopOff + along(0.2f)
			p.scaleX = 0.5f
			p.scaleY = 0.5f
			p.animate()
				.translationXBy((Random.nextFloat() - 0.5f) * dp(32f))
				.translationYBy(-dp(40f + Random.nextFloat() * 18f))
				.scaleX(1f).scaleY(1f).alpha(0f)
				.setDuration(1100)
				.withEndAction {
					particles.remove(p)
					remove(p)
				}
				.start()
		}
	}
}
