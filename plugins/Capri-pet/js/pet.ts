// Pure pet logic: no Discord imports, so it is easy to test and to port.

export interface PetState {
    name: string;
    hunger: number; // 0 = full, 100 = starving
    mood: number; // 0..100
    energy: number; // 0..100
    bond: number; // 0..100
    xp: number;
    lastTick: number;
    lastFed: number;
    x?: number;
    y?: number;
    /** bumped when saved data is loaded after the overlay mounted */
    rev?: number;
}

export const DEFAULT_NAME = "Capri";

export const newPet = (now = Date.now()): PetState => ({
    name: DEFAULT_NAME,
    hunger: 30,
    mood: 70,
    energy: 80,
    bond: 10,
    xp: 0,
    lastTick: now,
    lastFed: now
});

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Decay stats for time passed, including while the app was closed. Capped so she is never "dead". */
export function tick(p: PetState, now = Date.now()) {
    const hours = Math.min((now - p.lastTick) / 3_600_000, 48);
    if (hours <= 0) return;
    p.hunger = clamp(p.hunger + hours * 4);
    p.energy = clamp(p.energy + hours * (p.energy < 100 ? 3 : 0));
    p.mood = clamp(p.mood - hours * (p.hunger > 70 ? 4 : 1.5));
    p.lastTick = now;
}

export const level = (p: PetState) => 1 + Math.floor(Math.sqrt(p.xp / 10));

const bar = (v: number, n = 10) => "▰".repeat(Math.round(v / 100 * n)) + "▱".repeat(n - Math.round(v / 100 * n));

export function face(p: PetState) {
    if (p.hunger > 80) return "😿";
    if (p.energy < 20) return "😴";
    if (p.mood > 80) return "😻";
    if (p.mood > 50) return "😺";
    return "😾";
}

export function status(p: PetState) {
    return [
        `${face(p)} **${p.name}** · Lv ${level(p)} · ${p.xp} xp`,
        `\`hunger \` ${bar(100 - p.hunger)}`,
        `\`mood   \` ${bar(p.mood)}`,
        `\`energy \` ${bar(p.energy)}`,
        `\`bond   \` ${bar(p.bond)}`
    ].join("\n");
}

const gain = (p: PetState, xp: number, bond = 0) => {
    p.xp += xp;
    p.bond = clamp(p.bond + bond);
};

export function feed(p: PetState) {
    if (p.hunger < 15) return `${p.name} sniffs the snack and walks off. Not hungry. 🍣`;
    p.hunger = clamp(p.hunger - 40);
    p.mood = clamp(p.mood + 8);
    p.lastFed = Date.now();
    gain(p, 5, 2);
    return pick([
        `${p.name} devours a neon-glazed salmon cube. *crunch crunch* 🍣`,
        `${p.name} chirps and bumps your hand for seconds. 🐟`,
        `${p.name} eats, then blinks at you in slow, tiny pulses. 💡`
    ]);
}

export function play(p: PetState) {
    if (p.energy < 15) return `${p.name} is too tired to play. Let her nap first. 💤`;
    p.energy = clamp(p.energy - 20);
    p.hunger = clamp(p.hunger + 8);
    p.mood = clamp(p.mood + 15);
    gain(p, 8, 3);
    return pick([
        `${p.name} chases a laser dot across your screen. 🔴`,
        `${p.name} pounces on a cursor and misses spectacularly. 🖱️`,
        `${p.name} zooms around the chat at 144 fps. ⚡`
    ]);
}

export function pat(p: PetState) {
    p.mood = clamp(p.mood + 6);
    gain(p, 2, 4);
    return pick([
        `${p.name} leans into the pat and purrs, a little bit static-y. 〰️`,
        `${p.name}'s tail flicks neon pink. 💗`,
        `${p.name} headbutts your palm. Bond up. 🫶`
    ]);
}

export function nap(p: PetState) {
    p.energy = clamp(p.energy + 40);
    p.mood = clamp(p.mood + 3);
    p.hunger = clamp(p.hunger + 5);
    gain(p, 1);
    return `${p.name} curls up on a warm GPU and dozes off. 😴`;
}

export function speak(p: PetState) {
    if (p.hunger > 80) return `${p.name}: *loud hungry mrrp* 🍣?`;
    if (p.energy < 20) return `${p.name}: *yawn* ...zzz`;
    if (p.bond > 70) return `${p.name}: *purrs and stares directly into your soul* 💖`;
    return pick([`${p.name}: mrrp?`, `${p.name}: *tilts head*`, `${p.name}: nyaa~`, `${p.name}: *blinks slowly*`]);
}
