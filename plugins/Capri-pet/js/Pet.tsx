// Always-on-screen pet that chases your finger around, oneko-style.
// Drawn from plain Views (an original neon cyber-kitten): no image assets.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, Dimensions, PanResponder, Text, View } from "react-native";
import { onTouch, touch } from "./follow";
import { feed, level, nap, pat, play, speak, tick, type PetState } from "./pet";

const SIZE = 64;
const FOLLOW_MS = 6000; // keep chasing this long after the last touch, then go home
const NEON = { pink: "#ff3df2", cyan: "#27f5ff", body: "#1a1530", rim: "#6b3cff" };

function Kitten({ mood, sleepy, hungry, running }: { mood: number; sleepy: boolean; hungry: boolean; running: boolean }) {
    const eye = hungry ? NEON.pink : mood > 60 ? NEON.cyan : "#9aa0ff";
    const eyeH = sleepy ? 2 : running ? 8 : 10;
    const ear = (side: "left" | "right") => (
        <View style={{
            position: "absolute", top: -2, [side]: 6, width: 0, height: 0,
            borderLeftWidth: 9, borderRightWidth: 9, borderBottomWidth: 16,
            borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: NEON.rim
        }} />
    );
    return (
        <View style={{ width: SIZE, height: SIZE }}>
            {ear("left")}
            {ear("right")}
            <View style={{
                position: "absolute", bottom: 0, width: SIZE, height: SIZE - 12, borderRadius: 28,
                backgroundColor: NEON.body, borderWidth: 2, borderColor: NEON.rim,
                shadowColor: NEON.pink, shadowOpacity: 0.9, shadowRadius: 10, elevation: 8
            }}>
                <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 16, marginHorizontal: 10 }}>
                    <View style={{ width: 12, height: eyeH, borderRadius: 6, backgroundColor: eye, marginTop: sleepy ? 4 : 0 }} />
                    <View style={{ width: 12, height: eyeH, borderRadius: 6, backgroundColor: eye, marginTop: sleepy ? 4 : 0 }} />
                </View>
                <View style={{ alignSelf: "center", marginTop: 8, width: 30, height: 2, borderRadius: 1, backgroundColor: NEON.cyan, opacity: 0.7 }} />
                <Text style={{ textAlign: "center", color: NEON.pink, fontSize: 11, marginTop: 1 }}>{mood > 60 ? "ω" : "﹏"}</Text>
            </View>
        </View>
    );
}

/** Wraps the app root so every touch is observed (never consumed) and the pet is drawn on top. */
export function PetHost({ pet, save, children }: { pet: PetState; save: () => void; children?: ReactNode }) {
    return (
        <View
            style={{ flex: 1 }}
            onTouchStartCapture={onTouch}
            onTouchMoveCapture={onTouch}
            onTouchEndCapture={onTouch}
        >
            {children}
            <PetOverlay pet={pet} save={save} />
        </View>
    );
}

export default function PetOverlay({ pet, save }: { pet: PetState; save: () => void }) {
    const { width, height } = Dimensions.get("window");
    const home = useRef({ x: pet.x ?? width - SIZE - 12, y: pet.y ?? height * 0.55 }).current;
    const cur = useRef({ ...home }).current;
    const pos = useRef(new Animated.ValueXY(cur)).current;
    const facing = useRef(new Animated.Value(1)).current; // 1 = right, -1 = left
    const phase = useRef(new Animated.Value(0)).current;
    const dragging = useRef(false);
    const [running, setRunning] = useState(false);
    const [, force] = useState(0);
    const [bubble, setBubble] = useState<string | null>(null);
    const bubbleTimer = useRef<any>();

    const say = (t: string) => {
        setBubble(t);
        clearTimeout(bubbleTimer.current);
        bubbleTimer.current = setTimeout(() => setBubble(null), 3500);
    };
    const act = (fn: (p: PetState) => string) => { tick(pet); say(fn(pet)); save(); force(n => n + 1); };

    // Chase loop: head for the last touch while it is fresh, otherwise go back home.
    useEffect(() => {
        let last = Date.now();
        let wasRunning = false;
        let p = 0;
        let seenRev = pet.rev ?? 0;
        const loop = setInterval(() => {
            if ((pet.rev ?? 0) !== seenRev) { // saved pet finished loading after we mounted
                seenRev = pet.rev ?? 0;
                if (pet.x != null && pet.y != null) { home.x = pet.x; home.y = pet.y; }
                force(n => n + 1);
            }
            const now = Date.now();
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            if (dragging.current) return;

            const chasing = touch.x != null && now - touch.t < FOLLOW_MS;
            const tx = chasing ? (touch.x as number) - SIZE / 2 : home.x;
            const ty = chasing ? (touch.y as number) + 36 : home.y; // sit just below your finger
            const dx = tx - cur.x, dy = ty - cur.y;
            const dist = Math.hypot(dx, dy);

            const speed = pet.energy < 20 ? 70 : pet.hunger > 80 ? 110 : 190; // px per second
            const stopAt = chasing ? 14 : 4;
            const moving = dist > stopAt;

            if (moving) {
                const step = Math.min(dist - stopAt, speed * dt);
                cur.x += (dx / dist) * step;
                cur.y += (dy / dist) * step;
                cur.x = Math.max(0, Math.min(cur.x, width - SIZE));
                cur.y = Math.max(30, Math.min(cur.y, height - SIZE - 60));
                pos.setValue({ x: cur.x, y: cur.y });
                if (Math.abs(dx) > 4) facing.setValue(dx > 0 ? 1 : -1);
                p += dt * 14;
                phase.setValue(Math.sin(p));
            } else {
                phase.setValue(0);
            }
            if (moving !== wasRunning) { wasRunning = moving; setRunning(moving); }
        }, 33);

        const chat = setInterval(() => {
            tick(pet);
            force(n => n + 1);
            if (Math.random() < 0.2) say(speak(pet));
        }, 20_000);

        return () => { clearInterval(loop); clearInterval(chat); clearTimeout(bubbleTimer.current); };
    }, []);

    const responder = useMemo(() => {
        let moved = false, pressAt = 0, startX = 0, startY = 0;
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                moved = false; pressAt = Date.now(); startX = cur.x; startY = cur.y;
                dragging.current = true;
            },
            onPanResponderMove: (_e, g) => {
                if (Math.abs(g.dx) + Math.abs(g.dy) > 6) moved = true;
                cur.x = startX + g.dx; cur.y = startY + g.dy;
                pos.setValue({ x: cur.x, y: cur.y });
            },
            onPanResponderRelease: () => {
                dragging.current = false;
                if (moved) {
                    // dropping her sets her new "home" spot
                    home.x = pet.x = Math.max(0, Math.min(cur.x, width - SIZE));
                    home.y = pet.y = Math.max(30, Math.min(cur.y, height - SIZE - 60));
                    save();
                } else if (Date.now() - pressAt > 450) {
                    act(pet.hunger > 40 ? feed : pet.energy < 25 ? nap : play);
                } else {
                    act(pat);
                }
            },
            onPanResponderTerminate: () => { dragging.current = false; }
        });
    }, []);

    const hungry = pet.hunger > 70;
    const sleepy = pet.energy < 20;

    return (
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <Animated.View
                {...responder.panHandlers}
                style={{ position: "absolute", transform: [{ translateX: pos.x }, { translateY: pos.y }] }}
            >
                {bubble && (
                    <View style={{
                        position: "absolute", bottom: SIZE + 4, left: 0, minWidth: 90, maxWidth: 220,
                        padding: 8, borderRadius: 12, backgroundColor: "#000000cc", borderWidth: 1, borderColor: NEON.cyan
                    }}>
                        <Text style={{ color: "#fff", fontSize: 12 }}>{bubble}</Text>
                    </View>
                )}
                <Animated.View style={{
                    transform: [
                        { scaleX: facing },
                        { translateY: phase.interpolate({ inputRange: [-1, 1], outputRange: [3, -3] }) },
                        { rotate: phase.interpolate({ inputRange: [-1, 1], outputRange: ["-6deg", "6deg"] }) }
                    ]
                }}>
                    <Kitten mood={pet.mood} sleepy={sleepy} hungry={hungry} running={running} />
                </Animated.View>
                <Text style={{ textAlign: "center", color: NEON.cyan, fontSize: 9, marginTop: 2 }}>{pet.name} · Lv{level(pet)}</Text>
            </Animated.View>
        </View>
    );
}
