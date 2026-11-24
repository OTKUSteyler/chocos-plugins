/**
 * The ONLY file that imports Valenced's runtime modules.
 *
 * The build failed with "Import cannot be resolved: @valenced/modules/common", so the paths below
 * (all guesses) must be replaced with the real ones. Copy them from an existing plugin in the repo
 * (e.g. Nitro-Profiles) or from the @valenced/types declarations, then nothing else needs to change.
 *
 * Needed exports:
 *   React, ReactNative  - React and React Native
 *   findByName          - module finder (name, defaultExport) => component
 *   after               - patcher: after(methodName, object, (args, ret) => ret) => unpatch
 *   Forms               - { FormSection, FormRow, FormSwitch, FormText } for the settings page
 */
export { React, ReactNative } from "@valenced/modules/common" // TODO: verify path
export { findByName } from "@valenced/modules/finders" // TODO: verify path
export { after } from "@valenced/patcher" // TODO: verify path
export { Forms } from "@valenced/ui/components" // TODO: verify path
