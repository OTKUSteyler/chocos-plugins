import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useEffect, useMemo, useState } from 'react'
import { Image, Linking, ScrollView, View } from 'react-native'
import { fetchBG, fetchPFP, getCustomAvatar, getCustomBanner, getLastError } from './data'
import { getRuntimeSettings, getSettingsStorage, setRuntimeSettings } from './storage'
import type { PluginSettings } from './types'
import { DEFAULT_SETTINGS } from './types'

const { Card, Stack, TableRow, TableRowGroup, TableSwitchRow, Text, createStyles } = Design

const USRBG_INVITE = 'https://discord.gg/ECg96KZ3Fh'
const USERPFP_INVITE = 'https://discord.gg/userpfp-1129784704267210844'

function resolveCurrentUser(): any {
	try {
		return (Stores.UserStore as any)?.getCurrentUser?.()
	} catch {
		return undefined
	}
}

function discordAvatarUrl(currentUser: any): string {
	return currentUser?.avatar
		? `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png?size=128`
		: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(currentUser?.id || '0') >> 22n) % 5n)}.png`
}

const useStyles = createStyles({
	flex: { flex: 1 },
	content: { paddingBottom: 32 },
	avatar: { width: 92, height: 92, borderRadius: 22 },
	avatarPlaceholder: {
		width: 92,
		height: 92,
		borderRadius: 22,
		alignItems: 'center',
		justifyContent: 'center',
	},
	bannerCard: { padding: 0, overflow: 'hidden' },
	banner: { width: '100%', height: 120 },
	bannerEmpty: {
		width: '100%',
		height: 120,
		paddingHorizontal: 16,
		alignItems: 'center',
		justifyContent: 'center',
	},
	center: { textAlign: 'center' },
})

export default function Settings() {
	const styles = useStyles()

	// Persisted settings (reactive). The in-memory copy wins so a toggle never flickers back.
	const stored = getSettingsStorage().use()
	const settings: PluginSettings = { ...DEFAULT_SETTINGS, ...(stored ?? {}), ...getRuntimeSettings() }
	const [busy, setBusy] = useState<'bg' | 'pfp' | null>(null)
	const [status, setStatus] = useState('')
	const [currentUser, setCurrentUser] = useState<any>()
	const [pfpVersion, setPfpVersion] = useState(0)
	const [bgVersion, setBgVersion] = useState(0)

	useEffect(() => {
		setCurrentUser(resolveCurrentUser())
	}, [])

	// Prefer the UserPFP avatar when it's enabled and the user has one; otherwise use the Discord avatar.
	const avatarUrl = useMemo(() => {
		if (!currentUser) return undefined
		const custom = settings.userpfpEnabled && currentUser.id ? getCustomAvatar(currentUser.id, true) : undefined
		return custom ?? discordAvatarUrl(currentUser)
	}, [currentUser, settings.userpfpEnabled, pfpVersion])

	// USRBG banner for the current user, shown as a preview in the Nitro Banner section.
	const bannerUrl = useMemo(() => {
		if (!settings.userbgEnabled || !currentUser?.id) return undefined
		return getCustomBanner(currentUser.id)
	}, [currentUser, settings.userbgEnabled, bgVersion])

	async function update(patch: Partial<PluginSettings>) {
		setRuntimeSettings(patch) // patches pick this up immediately
		try {
			await getSettingsStorage().set(patch)
		} catch {
			setStatus('Could not save settings')
		}
	}

	async function reload(which: 'bg' | 'pfp') {
		setBusy(which)
		setStatus('')
		const label = which === 'bg' ? 'Banner collection' : 'Avatar collection'
		try {
			const ok = which === 'bg' ? await fetchBG() : await fetchPFP()
			if (which === 'pfp') setPfpVersion(v => v + 1)
			else setBgVersion(v => v + 1)
			setStatus(ok ? `${label}: reloaded` : `${label}: reload failed (${getLastError() || 'unknown error'})`)
		} catch (error) {
			setStatus(`${label}: reload failed (${error instanceof Error ? error.message : String(error)})`)
		} finally {
			setBusy(null)
		}
	}

	return (
		<Page>
			<ScrollView style={styles.flex}>
				<Stack spacing={16} style={styles.content}>
					<Card>
						<Stack direction="horizontal" spacing={16} align="center">
							{avatarUrl ? (
								<Image source={{ uri: avatarUrl }} style={styles.avatar} />
							) : (
								<View style={styles.avatarPlaceholder}>
									<Text variant="heading-xl/bold" color="text-muted">
										?
									</Text>
								</View>
							)}
							<Stack spacing={4} style={styles.flex}>
								<Text variant="heading-xl/bold" color="text-strong">
									Nitro Profiles
								</Text>
								<Text variant="text-md/medium" color="text-subtle">
									Personalize profiles with community banner and avatar collections.
								</Text>
							</Stack>
						</Stack>
					</Card>

					<Card style={styles.bannerCard}>
						{bannerUrl ? (
							<Image source={{ uri: bannerUrl }} resizeMode="cover" style={styles.banner} />
						) : (
							<View style={styles.bannerEmpty}>
								<Text variant="text-md/medium" color="text-subtle" style={styles.center}>
									{settings.userbgEnabled
										? 'No USRBG banner found for your account'
										: 'Custom banners are turned off'}
								</Text>
							</View>
						)}
					</Card>

					<TableRowGroup hasIcons title="Nitro Banner">
						<TableSwitchRow
							label="Community profile banners"
							subLabel="Enable custom banners from the community collection."
							value={settings.userbgEnabled}
							onValueChange={value => void update({ userbgEnabled: value })}
						/>
						<TableRow
							icon={<TableRowAssetIcon name="GlobeEarthIcon" />}
							label="Join the Nitro Banner community (USRBG)"
							arrow
							onPress={() => void Linking.openURL(USRBG_INVITE)}
						/>
						<TableRow
							icon={<TableRowAssetIcon name="RefreshIcon" />}
							label={busy === 'bg' ? 'Reloading banner collection…' : 'Reload banner collection'}
							disabled={busy !== null}
							onPress={() => void reload('bg')}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons title="Nitro Avatar">
						<TableSwitchRow
							label="Community profile avatars"
							subLabel="Enable custom avatars from the community collection. Restart Discord if changes don't appear."
							value={settings.userpfpEnabled}
							onValueChange={value => void update({ userpfpEnabled: value })}
						/>
						<TableRow
							icon={<TableRowAssetIcon name="GlobeEarthIcon" />}
							label="Join the Nitro Avatar community (UserPFP)"
							arrow
							onPress={() => void Linking.openURL(USERPFP_INVITE)}
						/>
						<TableRow
							icon={<TableRowAssetIcon name="RefreshIcon" />}
							label={busy === 'pfp' ? 'Reloading avatar collection…' : 'Reload avatar collection'}
							disabled={busy !== null}
							onPress={() => void reload('pfp')}
						/>
					</TableRowGroup>

					{!!status && (
						<Text variant="text-sm/medium" color="text-subtle" style={styles.center}>
							{status}
						</Text>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
