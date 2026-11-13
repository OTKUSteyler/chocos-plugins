import { getJsonStorage, pluginStoragePathFor } from "@valenced/json-storage";
import { createElement } from "react";
import { PetHost } from "./Pet";
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

        // Wrap the app root: the wrapper watches every touch (without consuming it) so the pet
        // can chase your finger, and draws her on top of everything.
        const [exports] = lookupModule(filters.withName("AppContainer"), { initialize: true } as any) as [any];
        const target = exports && typeof exports.default === "function" ? exports : undefined;

        if (!target) {
            console.warn("[capri-pet] AppContainer not found; pet disabled");
            return;
        }

        const unpatch = patcher.after(target, "default", (_args: any, ret: any) =>
            createElement(PetHost, { pet, save }, ret));
        api.cleanup(unpatch);
    }
});
