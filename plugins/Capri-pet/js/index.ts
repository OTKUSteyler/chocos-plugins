// Capri Pet for Valenced: a neon cyber-kitten that floats over the app and chases your finger.
// Port of choccychan's (OTKUSteyler) Capri Pet from chocos-plugins.

import type { JsonStorage } from '@valenced/json-storage'
import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { before } from '@valenced/patcher'
import * as React from 'react'
import PetOverlay, { PetHost, Safe } from './Pet'
import { newPet, type PetState, tick } from './pet'
import { toast } from './toast'

// Hosts that wrap the whole app (so touches can be watched and chased), best first,
// then a fallback that can only draw the pet.
const FULL_HOSTS = ['AppContainer', 'App']
const OVERLAY_HOSTS = ['AppToastContainer']

type Mode = 'full' | 'overlay'

// One shared pet object: the overlay reads it live and `save` writes it to disk.
const pet: PetState = newPet()
let storage: JsonStorage<PetState> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined

const save = () => {
	if (!storage) return
	clearTimeout(saveTimer)
	saveTimer = setTimeout(
		() => storage?.set({ ...pet, rev: undefined }, true),
		400,
	)
}

// The app's components are exported as bare functions, so they can't be patched in place.
// Instead, every element made from one of them is swapped for a wrapper that draws the pet too.
const targets = new Map<Function, Mode>()
const wrappers = new Map<Function, Function>()
let chosen: Function | undefined
let bypass = false

function wrapperFor(orig: Function, mode: Mode) {
	let wrapper = wrappers.get(orig)
	if (!wrapper) {
		// Builds the original element without running it through the swap again.
		const inner = (props: any) => {
			bypass = true
			try {
				return React.createElement(orig as any, props)
			} finally {
				bypass = false
			}
		}
		wrapper = (props: any) =>
			mode === 'full'
				? React.createElement(PetHost, { pet, save }, inner(props))
				: React.createElement(
						React.Fragment,
						null,
						inner(props),
						React.createElement(
							Safe,
							null,
							React.createElement(PetOverlay, { pet, save }),
						),
					)
		wrappers.set(orig, wrapper)
	}
	return wrapper
}

// A before-hook on element creation: returns the arguments, with the type swapped for the host.
const intercept = (args: any[]) => {
	try {
		const type = args?.[0]
		if (bypass || typeof type !== 'function') return args
		const mode = targets.get(type)
		if (!mode) return args
		if (!chosen) {
			chosen = type
			toast(`Capri Pet: attached to ${type.name || mode}`)
		}
		if (type !== chosen) return args
		return [wrapperFor(type, mode), ...args.slice(1)]
	} catch {
		return args
	}
}

/** The component is the module's export itself, or its default export. */
const componentOf = (exports: any): Function | undefined =>
	typeof exports === 'function'
		? exports
		: typeof exports?.default === 'function'
			? exports.default
			: undefined

export default plugin<{ jsonStorage: PetState }>({
	jsonStorage: { default: newPet(), load: true },

	start(api) {
		// Swapping the app root only takes effect on the next mount, so enabling mid-session needs a reload.
		if (api.plugin.startedLate) {
			toast('Capri Pet: fully restart Discord to show her')
			api.plugin.requireReload()
			return
		}

		storage = api.jsonStorage
		api.cleanup(() => {
			clearTimeout(saveTimer)
			storage = undefined
			targets.clear()
			wrappers.clear()
			chosen = undefined
		})

		// Load the saved pet and hand it to the already-mounted overlay.
		api.jsonStorage
			.get()
			.then(saved => {
				Object.assign(pet, saved)
				tick(pet)
				pet.rev = (pet.rev ?? 0) + 1
			})
			.catch(e => api.plugin.reportError(e))

		toast('Capri Pet: loaded')
		const found: string[] = []
		const missing = setTimeout(() => {
			if (!chosen)
				toast(
					`Capri Pet: never saw the app render (found: ${found.join(', ') || 'none'})`,
				)
		}, 8000)
		api.cleanup(() => clearTimeout(missing))

		const hook = (name: string, mode: Mode) => {
			api.cleanup(
				getModules(withName<any>(name), exports => {
					const component = componentOf(exports)
					if (!component) return
					found.push(name)
					targets.set(component, mode)
				}),
			)
		}
		for (const n of FULL_HOSTS) hook(n, 'full')
		for (const n of OVERLAY_HOSTS) hook(n, 'overlay')

		const patch = (obj: any, key: string) => {
			try {
				api.cleanup(before(obj, key, intercept))
			} catch (e) {
				api.plugin.reportError(e)
			}
		}
		patch(React, 'createElement')
		api.cleanup(
			getModules(withProps('jsx', 'jsxs'), (mod: any) => {
				const runtime = mod?.jsx ? mod : mod?.default
				for (const key of ['jsx', 'jsxs', 'jsxDEV'])
					if (typeof runtime?.[key] === 'function') patch(runtime, key)
			}),
		)
	},

	// Unpatching can't remove what Discord already rendered with the pet.
	stop(api) {
		api.plugin.requireReload()
	},
})
