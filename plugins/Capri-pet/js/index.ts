import { getJsonStorage, pluginStoragePathFor } from "@valenced/json-storage";
import { createElement, Fragment } from "react";
import PetOverlay from "./Pet";
import { newPet, tick, type PetState } from "./pet";

const ID = "com.otkusteyler.capri-pet";

export default plugin({
    async start(api) {
        const { modules, patcher } = api.unscoped;
        const { lookupModule, filters } = modules.finders;

        // Load (or create) the saved pet.
        const storage = getJsonStorage<PetState>(pluginStoragePathFor(ID, "pet.json"), { default: newPet() });
        const saved = (await storage.get()) as Partial<PetState>;
        const pet: PetState = { ...newPet(), ...saved };
        tick(pet);

        let timer: ReturnType<typeof setTimeout> | undefined;
        const save = () => {
            clearTimeout(timer as any);
            timer = setTimeout(() => storage.set({ ...pet }, true), 400) as any;
        };
        api.cleanup(() => clearTimeout(timer as any));

        // The app-level toast container is mounted above every screen, so the pet
        // rendered next to it stays on screen everywhere.
        const [exports] = lookupModule(filters.withName("AppToastContainer"), { initialize: true } as any) as [any];
        const target = exports && typeof exports.default === "function" ? exports : undefined;

        if (!target) {
            console.warn("[capri-pet] AppToastContainer not found; overlay disabled");
            return;
        }

        const unpatch = patcher.after(target, "default", (_args: any, ret: any) =>
            createElement(Fragment, null, ret, createElement(PetOverlay, { pet, save })));
        api.cleanup(unpatch);
    }
});
