// Small on-screen status messages, so a missing pet can be told apart from a crashed one.
export function toast(text: string) {
	try {
		valenced.discord.actions?.ToastActionCreators?.open(
			`capri-pet-${Date.now()}`,
			{ text } as any,
		)
	} catch {}
}
