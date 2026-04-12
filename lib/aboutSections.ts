export type AboutPageRow = Record<string, unknown>

export type AboutSectionSelection =
  | { pageId: number; kind: 'page' }
  | { pageId: number; kind: 'card'; index: number }
  | { pageId: number; kind: 'named'; name: string }

export type AboutAdminSection = {
  id: string
  pageId: number
  pageSlug: string
  slug: string
  title: string
  subtitle: string
  image_path: string
  description: string
  is_published: number
  position?: number
  editLink: string
  cardParam: string
}

type InternalAboutSection = AboutAdminSection & {
  orderIndex: number
  sourcePriority: number
}

const AGGREGATE_ABOUT_SLUGS = new Set(['about', 'aboutme'])

const toPublishedValue = (value: unknown) => {
  if (value === true || value === 1 || value === '1') return 1
  return 0
}

const normalizeSectionKey = (value: unknown) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')

const parseMetadata = (row: AboutPageRow) => {
  const rawMeta = row['metadata']
  if (!rawMeta) return {} as Record<string, unknown>
  try {
    return (typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta) as Record<string, unknown>
  } catch {
    return {} as Record<string, unknown>
  }
}

const sortSections = (left: InternalAboutSection, right: InternalAboutSection) => {
  const leftPos = typeof left.position === 'number' ? left.position : null
  const rightPos = typeof right.position === 'number' ? right.position : null
  if (leftPos !== null && rightPos !== null && leftPos !== rightPos) return leftPos - rightPos
  if (leftPos !== null && rightPos === null) return -1
  if (leftPos === null && rightPos !== null) return 1
  return left.orderIndex - right.orderIndex
}

const dedupeSections = (sections: InternalAboutSection[]) => {
  const bestByKey = new Map<string, InternalAboutSection>()
  for (const section of sections) {
    const sectionKey = normalizeSectionKey(section.title) || `${section.pageSlug}:${section.id}`
    const current = bestByKey.get(sectionKey)
    if (!current || section.sourcePriority > current.sourcePriority || (section.sourcePriority === current.sourcePriority && sortSections(section, current) < 0)) {
      bestByKey.set(sectionKey, section)
    }
  }
  return Array.from(bestByKey.values()).sort(sortSections)
}

const addSection = (
  sections: InternalAboutSection[],
  orderIndex: number,
  row: AboutPageRow,
  pageId: number,
  pageSlug: string,
  sourcePriority: number,
  cardParam: string,
  fallbackTitle: string,
  fallbackSubtitle: string,
  fallbackContent: string,
  card: Record<string, unknown>,
) => {
  const title = String(card['title'] ?? fallbackTitle ?? '')
  sections.push({
    id: `${pageId}-${cardParam === 'about' ? 'about' : cardParam === 'topology' ? 'topology' : cardParam === 'hamshack' ? 'hamshack' : `c-${cardParam}`}`,
    pageId,
    pageSlug,
    slug: `${pageSlug}#${cardParam}`,
    title,
    subtitle: String(card['subtitle'] ?? fallbackSubtitle ?? ''),
    image_path: String(card['image'] ?? ''),
    description: String(card['content'] ?? fallbackContent ?? ''),
    is_published: toPublishedValue(row['is_published']),
    position: typeof card['position'] === 'number' ? (card['position'] as number) : undefined,
    editLink: `/admin/about/${pageId}?card=${encodeURIComponent(cardParam)}`,
    cardParam,
    orderIndex,
    sourcePriority,
  })
}

export function buildAboutAdminSections(rows: AboutPageRow[]) {
  const sections: InternalAboutSection[] = []
  let orderIndex = 0

  for (const rawRow of rows) {
    const pageId = Number(rawRow['id'] ?? 0)
    if (!Number.isInteger(pageId) || pageId < 1) continue

    const pageSlug = String(rawRow['slug'] ?? '')
    const rowTitle = String(rawRow['title'] ?? '')
    const meta = parseMetadata(rawRow)
    const isAggregateRow = AGGREGATE_ABOUT_SLUGS.has(pageSlug)

    if (isAggregateRow && Array.isArray(meta['cards']) && (meta['cards'] as unknown[]).length > 0) {
      for (const [index, cardValue] of (meta['cards'] as unknown[]).entries()) {
        if (!cardValue || typeof cardValue !== 'object') continue
        addSection(sections, orderIndex++, rawRow, pageId, pageSlug, 10, String(index), rowTitle || 'About', '', String(rawRow['content'] ?? ''), cardValue as Record<string, unknown>)
      }
      continue
    }

    const namedCardConfigs = [
      { cardParam: 'about', metaKey: 'aboutCard', fallbackTitle: rowTitle || 'About Me', fallbackSubtitle: '', fallbackContent: String(rawRow['content'] ?? '') },
      { cardParam: 'topology', metaKey: 'topologyCard', fallbackTitle: 'Home Topology', fallbackSubtitle: 'Hidden Lakes Apartments, Kentwood', fallbackContent: '' },
      { cardParam: 'hamshack', metaKey: 'hamshackCard', fallbackTitle: 'Ham Shack', fallbackSubtitle: 'Home Radio & Workshop', fallbackContent: '' },
    ] as const

    for (const config of namedCardConfigs) {
      const cardValue = meta[config.metaKey]
      if (!cardValue || typeof cardValue !== 'object') continue
      addSection(
        sections,
        orderIndex++,
        rawRow,
        pageId,
        pageSlug,
        isAggregateRow ? 20 : 40,
        config.cardParam,
        config.fallbackTitle,
        config.fallbackSubtitle,
        config.fallbackContent,
        cardValue as Record<string, unknown>,
      )
    }
  }

  return dedupeSections(sections).map(({ orderIndex: _orderIndex, sourcePriority: _sourcePriority, ...section }) => section)
}

export function buildPublicAboutCards(rows: AboutPageRow[]) {
  return buildAboutAdminSections(rows.filter((row) => toPublishedValue(row['is_published']) === 1)).map((section) => ({
    title: section.title,
    subtitle: section.subtitle,
    content: section.description,
    image: section.image_path,
    position: section.position,
  }))
}

export function pickPrimaryAboutRow(rows: AboutPageRow[]) {
  const publishedRows = rows.filter((row) => toPublishedValue(row['is_published']) === 1)
  if (publishedRows.length === 0) return null

  const preferred = publishedRows.find((row) => {
    const slug = String(row['slug'] ?? '')
    return slug === 'about' || slug === 'aboutme'
  })
  if (preferred) return preferred

  return publishedRows.find((row) => {
    const slug = String(row['slug'] ?? '')
    const meta = parseMetadata(row)
    return Boolean(meta['aboutCard'] || meta['summary'] || (AGGREGATE_ABOUT_SLUGS.has(slug) && Array.isArray(meta['cards']) && (meta['cards'] as unknown[]).length > 0))
  }) || publishedRows[0]
}

export function parseAboutSectionId(rawId: string | number): AboutSectionSelection | null {
  const value = String(rawId || '').trim()
  if (!value) return null

  if (/^\d+$/.test(value)) return { pageId: Number(value), kind: 'page' }

  const cardMatch = value.match(/^(\d+)-c-(\d+)$/)
  if (cardMatch) return { pageId: Number(cardMatch[1]), kind: 'card', index: Number(cardMatch[2]) }

  const namedMatch = value.match(/^(\d+)-([a-zA-Z0-9_-]+)$/)
  if (namedMatch) return { pageId: Number(namedMatch[1]), kind: 'named', name: namedMatch[2] }

  return null
}

export function extractPageIdsFromAboutSelections(ids: Array<string | number>) {
  return Array.from(new Set(ids
    .map((id) => parseAboutSectionId(id))
    .filter((entry): entry is AboutSectionSelection => Boolean(entry))
    .map((entry) => entry.pageId)))
}

export function shouldDeleteWholeAboutPage(row: AboutPageRow | null | undefined, selection: AboutSectionSelection | null) {
  if (!row || !selection) return false
  if (selection.kind === 'page') return true

  const meta = parseMetadata(row)
  const cardsCount = Array.isArray(meta['cards']) ? (meta['cards'] as unknown[]).length : 0
  const namedCardKeys = ['aboutCard', 'topologyCard', 'hamshackCard'].filter((key) => meta[key] && typeof meta[key] === 'object')
  const summary = meta['summary']
  const hasSummary = Boolean(summary && typeof summary === 'object' && Object.keys(summary as Record<string, unknown>).length > 0)
  const hasContent = Boolean(String(row['content'] ?? '').trim())

  if (selection.kind === 'card') {
    return cardsCount === 1 && namedCardKeys.length === 0 && !hasSummary && !hasContent
  }

  return cardsCount === 0 && namedCardKeys.length === 1 && namedCardKeys[0] === `${selection.name}Card` && !hasSummary && !hasContent
}