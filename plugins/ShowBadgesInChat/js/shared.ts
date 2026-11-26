export interface Settings {
	ping: boolean
	username: boolean
	global: boolean
	globalOnly: boolean
}

export const DefaultSettings: Settings = {
	ping: true,
	username: true,
	global: true,
	globalOnly: false,
}
