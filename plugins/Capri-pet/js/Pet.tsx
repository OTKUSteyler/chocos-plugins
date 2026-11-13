// Always-on-screen pet. Drawn from plain Views (an original design: a neon cyber-kitten),
// so it needs no image assets and no extra native modules.
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, PanResponder, Text, View } from "react-native";
import { feed, level, nap, pat, play, speak, tick, type PetState } from "./pet";

const SIZE = 64;
const NEON = { pink: "#ff3df2", cyan: "#27f5ff", body: "#1a1530", rim: "#6b3cff" };

function Kitten({ mood, sleepy, hungry }: { mood: number; sleepy: boolean; hungry: boolean }) {
    const eye = hungry ? NEON.pink : mood > 60 ? NEON.cyan : "#9aa0ff";
    const eyeH = sleepy ? 2 : 10;
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
                {/* cheek visor line */}
                <View style={{ alignSelf: "center", marginTop: 8, width: 30, height: 2, borderRadius: 1, backgroundColor: NEON.cyan, opacity: 0.7 }} />
                <Text style={{ textAlign: "center", color: NEON.pink, fontSize: 11, marginTop: 1 }}>{mood > 60 ? "ω" : "﹏"}</Text>
            </View>
        </View>
    );
}

export default function PetOverlay({ pet, save }: { pet: PetState; save: () => void }) {
    const { width, height } = Dimensions.get("window");
    const pos = useRef(new Animated.ValueXY({ x: pet.x ?? width - SIZE - 12, y: pet.y ?? height * 0.55 })).current;
    const bob = useRef(new Animated.Value(0)).current;
    const [, force] = useState(0);
    const [bubble, setBubble] = useState<string | null>(null);
    const bubbleTimer = useRef<any>();

    const say = (t: string) => {
        setBubble(t);
        clearTimeout(bubbleTimer.current);
        bubbleTimer.current = setTimeout(() => setBubble(null), 3500);
    };
    const act = (fn: (p: PetState) => string) => { tick(pet); say(fn(pet)); save(); force(n => n + 1); };

    // idle bob + periodic stat refresh and little idle chatter
    useEffect(() => {
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(bob, { toValue: -4, duration: 900, useNativeDriver: true }),
            Animated.timing(bob, { toValue: 0, duration: 900, useNativeDriver: true })
        ]));
        loop.start();
        const t = setInterval(() => {
            tick(pet);
            force(n => n + 1);
            if (Math.random() < 0.25) say(speak(pet));
        }, 20_000);
        return () => { loop.stop(); clearInterval(t); clearTimeout(bubbleTimer.current); };
    }, []);

    const responder = useMemo(() => {
        let moved = false, pressAt = 0;
        return PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
                moved = false; pressAt = Date.now();
                pos.extractOffset();
            },
            onPanResponderMove: (e, g) => {
                if (Math.abs(g.dx) + Math.abs(g.dy) > 6) moved = true;
                pos.setValue({ x: g.dx, y: g.dy });
            },
            onPanResponderRelease: () => {
                pos.flattenOffset();
                if (moved) {
                    // clamp to screen and remember
                    const x = Math.max(0, Math.min((pos.x as any)._value, width - SIZE));
                    const y = Math.max(40, Math.min((pos.y as any)._value, height - SIZE - 80));
                    Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false }).start();
                    pet.x = x; pet.y = y; save();
                } else if (Date.now() - pressAt > 450) {
                    // long press: feed or play depending on what she needs
                    act(pet.hunger > 40 ? feed : pet.energy < 25 ? nap : play);
                } else {
                    act(pat);
                }
            }
        });
    }, []);

    const hungry = pet.hunger > 70;
    const sleepy = pet.energy < 20;

    return (
        <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
            <Animated.View {...responder.panHandlers} style={{ position: "absolute", transform: [...pos.getTranslateTransform(), { translateY: bob }] }}>
                {bubble && (
                    <View style={{
                        position: "absolute", bottom: SIZE + 4, right: 0, minWidth: 90, maxWidth: 220,
                        padding: 8, borderRadius: 12, backgroundColor: "#000000cc", borderWidth: 1, borderColor: NEON.cyan
                    }}>
                        <Text style={{ color: "#fff", fontSize: 12 }}>{bubble}</Text>
                    </View>
                )}
                <Kitten mood={pet.mood} sleepy={sleepy} hungry={hungry} />
                <Text style={{ textAlign: "center", color: NEON.cyan, fontSize: 9, marginTop: 2 }}>{pet.name} · Lv{level(pet)}</Text>
            </Animated.View>
        </View>
    );
}
