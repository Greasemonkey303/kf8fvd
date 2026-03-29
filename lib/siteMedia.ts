import { buildPublicUrl } from '@/lib/s3'

export const SITE_MEDIA = {
  homeHero: { key: 'hero/static/grand_rapids.jpg', legacyPath: '/grand_rapids.jpg' },
  aboutHeadshot: { key: 'about/static/headshot.jpg', legacyPath: '/headshot.jpg' },
  aboutTopology: { key: 'about/static/apts.jpg', legacyPath: '/apts.jpg' },
  aboutHamshack: { key: 'about/static/hamshack.jpg', legacyPath: '/hamshack.jpg' },
  hotspot1: { key: 'projects/hotspot/static/hotspot-1.jpg', legacyPath: '/hotspot/hotspot-1.jpg' },
  hotspot2: { key: 'projects/hotspot/static/hotspot-2.jpg', legacyPath: '/hotspot/hotspot-2.jpg' },
  hotspot3: { key: 'projects/hotspot/static/hotspot-3.jpg', legacyPath: '/hotspot/hotspot-3.jpg' },
} as const

export type SiteMediaName = keyof typeof SITE_MEDIA

const LEGACY_PATH_MAP = Object.fromEntries(
  Object.entries(SITE_MEDIA).map(([name, entry]) => [entry.legacyPath, name as SiteMediaName]),
) as Record<string, SiteMediaName>

export function getSiteMediaKey(name: SiteMediaName) {
  return SITE_MEDIA[name].key
}

export function getSiteMediaUrl(name: SiteMediaName) {
  return buildPublicUrl(getSiteMediaKey(name))
}

export function getHotspotGalleryUrls() {
  return [getSiteMediaUrl('hotspot1'), getSiteMediaUrl('hotspot2'), getSiteMediaUrl('hotspot3')]
}

export function replaceLegacyBundledImagePath(value: string) {
  const mappedName = LEGACY_PATH_MAP[value]
  return mappedName ? getSiteMediaUrl(mappedName) : value
}

export function replaceLegacyBundledImageKey(value: string) {
  const mappedName = LEGACY_PATH_MAP[value]
  return mappedName ? getSiteMediaKey(mappedName) : value
}

export function resolveManagedImageUrl(value: unknown, fallbackName?: SiteMediaName) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallbackName ? getSiteMediaUrl(fallbackName) : ''
  }

  const trimmed = value.trim()
  const mapped = replaceLegacyBundledImagePath(trimmed)
  if (mapped !== trimmed) return mapped
  if (trimmed.startsWith('/') || /^https?:\/\//i.test(trimmed)) return trimmed
  return buildPublicUrl(trimmed)
}

export function isLegacyBundledImagePath(value: unknown): value is string {
  return typeof value === 'string' && value in LEGACY_PATH_MAP
}