import { computed, nextTick, onMounted, ref, watch } from 'vue'   
import { useRoute, useRouter } from 'vue-router'   
import { useClipboard } from '@/composables/useClipboard'   
import type { TablePayload, TableRow } from '@/types/table'

type TabKey = 'svg' | 'stl-panneau' | 'stl-piece' | 'stl-piece-roulotte' | 'gcode' | 'pseudo'

type ApiPiece = {
  id: number
  classe: string | null
  nom: string | null
  svg: string | null
  commandeId: number
  panneauId: number | null
}

const isTablePayload = (value: unknown): value is TablePayload => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<TablePayload>
  return Array.isArray(candidate.columns) && Array.isArray(candidate.rows)
}

const readRowValue = (row: TableRow, key: string): unknown => {
  const targetKey = Object.keys(row).find((entry) => entry.toLowerCase() === key.toLowerCase())
  return targetKey ? row[targetKey] : undefined
}

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? null : value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return null
    }
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const toStringOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  return String(value)
}

const mapTableRowToPiece = (row: TableRow): ApiPiece => {
  const id = toNumberOrNull(readRowValue(row, 'Id')) ?? 0
  const commandeId = toNumberOrNull(readRowValue(row, 'CommandeId')) ?? 0
  const panneauId = toNumberOrNull(readRowValue(row, 'PanneauId'))

  return {
    id,
    classe: toStringOrNull(readRowValue(row, 'Classe')),
    nom: toStringOrNull(readRowValue(row, 'Nom')),
    svg: toStringOrNull(readRowValue(row, 'SVG')),
    commandeId,
    panneauId,
  }
}

const normalizePiecePayload = (payload: ApiPiece[] | TablePayload | null | undefined): ApiPiece[] => {
  if (!payload) {
    return []
  }
  if (Array.isArray(payload)) {
    return payload
  }
  if (isTablePayload(payload)) {
    return payload.rows.map((row) => mapTableRowToPiece(row))
  }
  return []
}

type InstructionProgram = {
  id: string
  pieceId: string
  pieceName: string
  panelId: string
  commandId: string
  operation: string
  machine: string
  version: string
  updatedAt: string
}

type ApiInstructionPanneau = {
  id: number
  typeInstruction: string | null
  machine: string | null
  stringlist: string | null
  pseudo: string | null
  timeCreation: string | null
  panneauId: number
}

type ApiInstructionPiece = {
  id: number
  typeInstruction: string | null
  machine: string | null
  stringlist: string | null
  pseudo: string | null
  timeCreation: string | null
  pieceId: number
}

type InstructionDetails = {
  id: number
  type: 'gcode' | 'krl' | null
  stringlist: string
  pseudo: string[]
  machine: string
  timeCreation: string
}

export function useInstructionsView() {
const TAB_LABELS: Record<TabKey, string> = {
  svg: 'SVG',
  'stl-panneau': 'STL Panneau',
  'stl-piece': 'STL Piece',
  'stl-piece-roulotte': 'STL Piece-Roulotte',
  gcode: 'G-Code',
  pseudo: 'Pseudo-code',
}

const BASE_TAB_ORDER: TabKey[] = ['svg', 'stl-panneau', 'stl-piece', 'stl-piece-roulotte', 'gcode', 'pseudo']

const activeTab = ref<TabKey>('svg')      

const getTabLabel = (tab: TabKey) => {
  if (tab === 'gcode') {
    const type = currentInstructionType.value
    if (type === 'krl') {
      return 'KRL'
    }
    return 'G-Code'
  }
  return TAB_LABELS[tab]
}


const programs = ref<InstructionProgram[]>([])
const selectedCommandeId = ref('')
const selectedPanelId = ref('')
const selectedPieceId = ref('')
const pieceFiltersKey = ref(0)
const panelInstructionsCache = ref<Record<string, InstructionDetails | null>>({})
const pieceInstructionsCache = ref<Record<string, InstructionDetails | null>>({})
const isLoading = ref(false)   
const loadError = ref('')      

const { copyText } = useClipboard()   
const route = useRoute()   
const router = useRouter()

const breadcrumbTitle = computed(() => {
  const parts: string[] = []
  const routeCommande = typeof route.query.commande === 'string' ? route.query.commande.trim() : ''
  const commandeId = selectedCommandeId.value.trim() || routeCommande
  if (commandeId) {
    parts.push(`Commande ${commandeId}`)
  }

  const routePanneau = typeof route.query.panneau === 'string' ? route.query.panneau.trim() : ''
  const panneauId = selectedPanelId.value.trim() || routePanneau
  if (panneauId) {
    parts.push(`Panneau ${panneauId}`)
  }

  const routePiece = typeof route.query.pieceId === 'string' ? route.query.pieceId.trim() : ''
  const pieceId = selectedPieceId.value.trim() || routePiece
  if (pieceId) {
    parts.push(`Piece ${pieceId}`)
  }

  parts.push('Details')
  return parts.join(' - ')
})

const hasPanelSelection = computed(() => selectedPanelId.value.trim().length > 0)
const hasRenderablePanelSelection = computed(() => {
  const value = selectedPanelId.value.trim()
  if (value.length === 0) {
    return false
  }
  return value.toLowerCase() !== 'n/a'
})
const hasPieceSelection = computed(() => selectedPieceId.value.trim().length > 0)

const visibleTabs = computed<TabKey[]>(() => {
  const tabs = BASE_TAB_ORDER.filter((tab) => {
    if (tab === 'stl-panneau') {
      return hasRenderablePanelSelection.value
    }
    if (tab === 'svg' || tab === 'stl-piece' || tab === 'stl-piece-roulotte') {
      return hasPieceSelection.value
    }
    return true
  })

  return tabs.length > 0 ? tabs : ['gcode', 'pseudo']
})

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'      

const currentProgram = computed<InstructionProgram | null>(() => {
  if (programs.value.length === 0) {
    return null
  }

  if (!hasPanelSelection.value && !hasPieceSelection.value) {
    return null
  }

  const pieceId = selectedPieceId.value.trim()
  if (pieceId.length > 0) {
    const byPiece = programs.value.find((program) => program.pieceId === pieceId)
    if (byPiece) {
      return byPiece
    }
  }

  const panelId = selectedPanelId.value.trim()
  if (panelId.length > 0) {
    const byPanel = programs.value.find((program) => {
      if (program.panelId !== panelId) {
        return false
      }
      if (selectedCommandeId.value.trim().length === 0) {
        return true
      }
      return program.commandId === selectedCommandeId.value
    })
    if (byPanel) {
      return byPanel
    }
  }

  const commandeId = selectedCommandeId.value.trim()
  if (commandeId.length > 0) {
    const byCommande = programs.value.find((program) => program.commandId === commandeId)
    if (byCommande) {
      return byCommande
    }
  }

  return null
})      

const currentPanelInstruction = computed<InstructionDetails | null>(() => {
  const program = currentProgram.value
  if (!program) {
    return null
  }
  if (!program.panelId || program.panelId === 'N/A') {
    return null
  }
  if (!Object.prototype.hasOwnProperty.call(panelInstructionsCache.value, program.panelId)) {
    return null
  }
  return panelInstructionsCache.value[program.panelId] ?? null
})

const currentPieceInstruction = computed<InstructionDetails | null>(() => {
  const program = currentProgram.value
  if (!program) {
    return null
  }
  if (!Object.prototype.hasOwnProperty.call(pieceInstructionsCache.value, program.pieceId)) {
    return null
  }
  return pieceInstructionsCache.value[program.pieceId] ?? null
})

const currentInstruction = computed<InstructionDetails | null>(() => {
  if (hasPieceSelection.value) {
    return currentPieceInstruction.value
  }
  return currentPanelInstruction.value
})

const currentInstructionType = computed(() => currentInstruction.value?.type ?? null)

const currentGcode = computed(() => currentInstruction.value?.stringlist ?? '')

const currentPseudoSteps = computed(() => currentInstruction.value?.pseudo ?? [])

const isGcodeProgram = computed(() => currentInstructionType.value === 'gcode')

const pseudoCode = computed(() => {
  if (currentPseudoSteps.value.length === 0) {
    return ''
  }

  return currentPseudoSteps.value
    .map((step, index) => `STEP_${String(index + 1).padStart(2, '0')}: ${step}`)
    .join('\n')
})

const displayMachine = computed(() => {
  const program = currentProgram.value
  if (!program) {
    return ''
  }
  const instruction = hasPieceSelection.value
    ? currentPieceInstruction.value
    : currentPanelInstruction.value

  if (instruction && instruction.machine.length > 0) {
    return instruction.machine
  }

  return program.machine
})

const instructionTarget = computed<null | { kind: 'piece' | 'panel'; id: string }>(() => {
  const program = currentProgram.value
  if (!program) {
    return null
  }

  if (hasPieceSelection.value) {
    return { kind: 'piece', id: program.pieceId }
  }

  if (hasPanelSelection.value && program.panelId && program.panelId !== 'N/A') {
    return { kind: 'panel', id: program.panelId }
  }

  return null
})

const compareIdentifiers = (left: string, right: string) => {
  const numericLeft = Number(left)
  const numericRight = Number(right)

  const leftIsNumeric = Number.isFinite(numericLeft)
  const rightIsNumeric = Number.isFinite(numericRight)

  if (leftIsNumeric && rightIsNumeric) {
    return numericLeft - numericRight
  }

  if (leftIsNumeric) {
    return -1
  }

  if (rightIsNumeric) {
    return 1
  }

  return left.localeCompare(right, 'fr', { sensitivity: 'base' })
}

const commandeOptions = computed<string[]>(() => {
  const ids = new Set<string>()
  for (const program of programs.value) {
    ids.add(program.commandId)
  }
  return Array.from(ids).sort(compareIdentifiers)
})

const panelOptions = computed<string[]>(() => {
  const filtered = selectedCommandeId.value.trim().length > 0
    ? programs.value.filter((program) => program.commandId === selectedCommandeId.value)
    : programs.value

  const ids = new Set<string>()
  for (const program of filtered) {
    ids.add(program.panelId)
  }
  return Array.from(ids).sort(compareIdentifiers)
})

const pieceCandidates = computed(() => {
  return programs.value.filter((program) => {
    if (selectedCommandeId.value.trim().length > 0 && program.commandId !== selectedCommandeId.value) {
      return false
    }
    if (selectedPanelId.value.trim().length > 0 && program.panelId !== selectedPanelId.value) {
      return false
    }
    return true
  })
})

const pieceIdOptions = computed<string[]>(() => {
  const ids = new Set<string>()
  for (const program of pieceCandidates.value) {
    ids.add(program.pieceId)
  }
  return Array.from(ids).sort(compareIdentifiers)
})

const pieceNameOptions = computed(() => {
  const seen = new Set<string>()
  const options: { value: string; label: string }[] = []

  for (const program of pieceCandidates.value) {
    if (seen.has(program.pieceId)) {
      continue
    }
    seen.add(program.pieceId)
    options.push({
      value: program.pieceId,
      label: program.pieceName,
    })
  }

  options.sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }))
  return options
})

const selectedPieceName = computed(() => {
  if (selectedPieceId.value.trim().length === 0) {
    return ''
  }
  const match = programs.value.find((program) => program.pieceId === selectedPieceId.value)
  return match ? match.pieceName : ''
})

let isApplyingSelections = false
let isSyncingRoute = false
let isProcessingRouteChange = false
let pendingHandlers: { commande?: string; panel?: string; piece?: string } | null = null
let pendingRouteQuery: Record<string, string> | null = null
let isRouteSyncScheduled = false
const currentDatasetKey = ref('')

const getRouteDatasetKey = () => {
  const commandeParam = typeof route.query.commande === 'string' ? route.query.commande.trim() : ''
  if (commandeParam.length > 0) {
    return `commande:${commandeParam}`
  }
  const panelParam = typeof route.query.panneau === 'string' ? route.query.panneau.trim() : ''
  if (panelParam.length > 0) {
    return `panel:${panelParam}`
  }
  const pieceParam = typeof route.query.pieceId === 'string'
    ? route.query.pieceId.trim()
    : typeof route.query.piece === 'string'
      ? route.query.piece.trim()
      : ''
  if (pieceParam.length > 0) {
    return `piece:${pieceParam}`
  }
  return 'all'
}

const queuePendingHandler = (key: 'commande' | 'panel' | 'piece', value: string) => {
  pendingHandlers = pendingHandlers ?? {}
  pendingHandlers[key] = value
}

const flushPendingHandlers = () => {
  if (!pendingHandlers) {
    return
  }

  if (isApplyingSelections || isProcessingRouteChange || isSyncingRoute) {
    replaceRouteWithSelections()
    return
  }

  const pending = pendingHandlers
  pendingHandlers = null

  if (Object.prototype.hasOwnProperty.call(pending, 'commande')) {
    onCommandeChange(undefined, true, pending.commande ?? '')
  }
  if (Object.prototype.hasOwnProperty.call(pending, 'panel')) {
    onPanelChange(undefined, true, pending.panel ?? '')
  }
  if (Object.prototype.hasOwnProperty.call(pending, 'piece')) {
    onPieceChange(undefined, true, pending.piece ?? '')
  }

  scheduleRouteSync()
}

const buildRouteQuery = (): Record<string, string> => {
  const query: Record<string, string> = {}

  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'commande' || key === 'panneau' || key === 'pieceId') {
      continue
    }
    if (Array.isArray(value)) {
      const last = value[value.length - 1]
      if (typeof last === 'string') {
        query[key] = last
      }
    } else if (typeof value === 'string') {
      query[key] = value
    }
  }

  const commande = selectedCommandeId.value.trim()
  if (commande.length > 0) {
    query.commande = commande
  }

  const panneau = selectedPanelId.value.trim()
  if (panneau.length > 0) {
    query.panneau = panneau
  } else {
    delete query.panneau
  }

  const piece = selectedPieceId.value.trim()
  if (piece.length > 0) {
    query.pieceId = piece
  } else {
    delete query.pieceId
  }

  return query
}

const queriesMatch = (next: Record<string, string>, current: Record<string, unknown>): boolean => {
  const keys = new Set([...Object.keys(next), ...Object.keys(current)])
  for (const key of keys) {
    const nextValue = next[key]
    const currentValue = current[key]

    if (Array.isArray(currentValue)) {
      if (currentValue.length !== 1 || currentValue[0] !== nextValue) {
        return false
      }
      continue
    }

    if (typeof nextValue === 'undefined' && typeof currentValue === 'undefined') {
      continue
    }

    if (typeof nextValue === 'undefined' && typeof currentValue === 'string' && currentValue.length === 0) {
      continue
    }

    if (typeof currentValue === 'undefined' && typeof nextValue === 'undefined') {
      continue
    }

    if (typeof nextValue === 'undefined' && typeof currentValue === 'string') {
      if (currentValue.length === 0) {
        continue
      }
      return false
    }

    if (typeof currentValue === 'undefined' && typeof nextValue === 'string') {
      if (nextValue.length === 0) {
        continue
      }
      return false
    }

    if (nextValue !== currentValue) {
      return false
    }
  }

  return true
}

const scheduleRouteSync = () => {
  pendingRouteQuery = buildRouteQuery()
  if (
    isRouteSyncScheduled ||
    isApplyingSelections ||
    isProcessingRouteChange ||
    isSyncingRoute
  ) {
    return
  }

  isRouteSyncScheduled = true

  queueMicrotask(() => {
    isRouteSyncScheduled = false

    if (!pendingRouteQuery) {
      flushPendingHandlers()
      return
    }

    const nextQuery = pendingRouteQuery
    pendingRouteQuery = null

    if (queriesMatch(nextQuery, route.query)) {
      flushPendingHandlers()
      return
    }

    isSyncingRoute = true
    void router.replace({ query: nextQuery }).finally(() => {
      isSyncingRoute = false
      flushPendingHandlers()
      scheduleRouteSync()
    })
  })
}

const requestRouteSync = () => {
  scheduleRouteSync()
}

const replaceRouteWithSelections = () => {
  const nextQuery = buildRouteQuery()

  if (queriesMatch(nextQuery, route.query)) {
    return
  }

  isSyncingRoute = true
  void router.replace({ query: nextQuery }).finally(() => {
    isSyncingRoute = false
    flushPendingHandlers()
  })
}

const normalizeId = (value: unknown) => {
  const str = typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  if (str.length === 0) return ''
  const numeric = Number(str)
  return Number.isFinite(numeric) ? String(numeric) : str
}

const applySelectionsFromRoute = () => {
  isApplyingSelections = true

  const commandeParam = normalizeId(typeof route.query.commande === 'string' ? route.query.commande : '')
  const panneauParam = normalizeId(typeof route.query.panneau === 'string' ? route.query.panneau : '')
  const pieceParam = normalizeId(
    typeof route.query.pieceId === 'string'
      ? route.query.pieceId
      : typeof route.query.piece === 'string'
        ? route.query.piece
        : ''
  )

  const validCommande = programs.value.some((program) => normalizeId(program.commandId) === commandeParam)
  selectedCommandeId.value = validCommande ? commandeParam : commandeParam

  const panelMatchesCommande = (panelId: string) =>
    programs.value.some(
      (program) =>
        normalizeId(program.panelId) === panelId &&
        (selectedCommandeId.value === '' || normalizeId(program.commandId) === selectedCommandeId.value)
    )

  selectedPanelId.value =
    panneauParam && panelMatchesCommande(panneauParam) ? panneauParam : panneauParam

  const pieceProgram = programs.value.find((program) => normalizeId(program.pieceId) === pieceParam)

  if (pieceProgram) {
    selectedPieceId.value = pieceParam
    selectedPanelId.value = normalizeId(pieceProgram.panelId)
    selectedCommandeId.value = normalizeId(pieceProgram.commandId)
  } else {
    selectedPieceId.value =
      pieceParam && programs.value.some((program) => normalizeId(program.pieceId) === pieceParam)
        ? pieceParam
        : ''

    if (selectedPanelId.value) {
      const panelProgram = programs.value.find(
        (program) =>
          normalizeId(program.panelId) === selectedPanelId.value &&
          (selectedCommandeId.value === '' || normalizeId(program.commandId) === selectedCommandeId.value)
      )
      if (panelProgram) {
        if (
          selectedCommandeId.value.length > 0 &&
          selectedCommandeId.value !== normalizeId(panelProgram.commandId)
        ) {
          selectedCommandeId.value = normalizeId(panelProgram.commandId)
        }
      } else {
        selectedPanelId.value = ''
      }
    }
  }

  isApplyingSelections = false
  if (!isProcessingRouteChange) {
    replaceRouteWithSelections()
    flushPendingHandlers()
  }
}

const resetPieceFilters = (options?: { guard?: boolean }) => {
  const shouldGuard = options?.guard ?? true
  const wasApplying = isApplyingSelections

  if (shouldGuard && !wasApplying) {
    isApplyingSelections = true
  }

  if (selectedPieceId.value !== '') {
    selectedPieceId.value = ''
  }

  pieceFiltersKey.value += 1

  if (shouldGuard && !wasApplying) {
    isApplyingSelections = false
  }
}

const getSelectValue = (event: Event | undefined, fallback: string) => {
  if (!event) {
    return fallback
  }
  const target = event.target as HTMLSelectElement | null
  if (target && typeof target.value === 'string') {
    return target.value
  }
  return fallback
}

const onCommandeChange = (event?: Event, force = false, overrideValue?: string) => {
  const rawValue = normalizeId(overrideValue ?? getSelectValue(event, selectedCommandeId.value))
  if (selectedCommandeId.value !== rawValue) {
    selectedCommandeId.value = rawValue
  }

  if (!force && (isApplyingSelections || isProcessingRouteChange || isSyncingRoute)) {
    queuePendingHandler('commande', rawValue)
    return
  }

  isApplyingSelections = true
  let shouldSync = false
  try {
    const trimmed = rawValue.trim()

    if (trimmed.length === 0) {
      if (selectedPanelId.value) {
        selectedPanelId.value = ''
      }
      resetPieceFilters({ guard: false })
      shouldSync = true
      return
    }

    const hasCommande = programs.value.some((program) => normalizeId(program.commandId) === trimmed)

    if (!hasCommande) {
      selectedCommandeId.value = ''
      selectedPanelId.value = ''
      resetPieceFilters({ guard: false })
      shouldSync = true
      return
    }

    if (
      selectedPanelId.value &&
      !programs.value.some(
        (program) =>
          normalizeId(program.commandId) === trimmed && normalizeId(program.panelId) === selectedPanelId.value
      )
    ) {
      selectedPanelId.value = ''
    }

    if (
      selectedPieceId.value &&
      !programs.value.some(
        (program) =>
          normalizeId(program.commandId) === trimmed && normalizeId(program.pieceId) === selectedPieceId.value
      )
    ) {
      resetPieceFilters({ guard: false })
    }

    shouldSync = true
  } finally {
    isApplyingSelections = false
    if (shouldSync) {
      replaceRouteWithSelections()
    }
    flushPendingHandlers()
  }
}

const onPanelChange = (event?: Event, force = false, overrideValue?: string) => {
  const rawValue = normalizeId(overrideValue ?? getSelectValue(event, selectedPanelId.value))
  if (selectedPanelId.value !== rawValue) {
    selectedPanelId.value = rawValue
  }

  if (!force && (isApplyingSelections || isProcessingRouteChange || isSyncingRoute)) {
    queuePendingHandler('panel', rawValue)
    return
  }

  isApplyingSelections = true
  let shouldSync = false
  try {
    const trimmed = rawValue.trim()

    if (trimmed.length === 0) {
      resetPieceFilters({ guard: false })
      shouldSync = true
      return
    }

    shouldSync = true

    const matchingProgram =
      programs.value.find((program) => {
        if (normalizeId(program.panelId) !== trimmed) {
          return false
        }
        if (selectedCommandeId.value && normalizeId(program.commandId) !== selectedCommandeId.value) {
          return false
        }
        return true
      }) ?? programs.value.find((program) => normalizeId(program.panelId) === trimmed)

    if (matchingProgram && selectedCommandeId.value !== matchingProgram.commandId) {
      selectedCommandeId.value = matchingProgram.commandId
    } else if (!matchingProgram && programs.value.length === 0) {
      replaceRouteWithSelections()
      flushPendingHandlers()
      return
    }

    if (
      selectedPieceId.value &&
      !programs.value.some(
        (program) =>
          normalizeId(program.panelId) === trimmed && normalizeId(program.pieceId) === selectedPieceId.value
      )
    ) {
      resetPieceFilters({ guard: false })
    }
  } finally {
    isApplyingSelections = false
    if (shouldSync) {
      replaceRouteWithSelections()
    }
    flushPendingHandlers()
  }
}

const onPieceChange = (event?: Event, force = false, overrideValue?: string) => {
  const rawValue = normalizeId(overrideValue ?? getSelectValue(event, selectedPieceId.value))
  if (selectedPieceId.value !== rawValue) {
    selectedPieceId.value = rawValue
  }

  if (!force && (isApplyingSelections || isProcessingRouteChange || isSyncingRoute)) {
    queuePendingHandler('piece', rawValue)
    return
  }

  isApplyingSelections = true
  let shouldSync = false
  try {
    const trimmed = rawValue.trim()

    if (trimmed.length === 0) {
      if (selectedPanelId.value.trim().toLowerCase() === 'n/a') {
        selectedPanelId.value = ''
      }
      resetPieceFilters({ guard: false })
      shouldSync = true
      return
    }

    const program = programs.value.find((item) => normalizeId(item.pieceId) === trimmed)

    if (!program) {
      resetPieceFilters({ guard: false })
      shouldSync = true
      return
    }

    selectedPanelId.value = normalizeId(program.panelId)
    selectedCommandeId.value = normalizeId(program.commandId)

    shouldSync = true
  } finally {
    isApplyingSelections = false
    if (shouldSync) {
      replaceRouteWithSelections()
    }
    flushPendingHandlers()
  }
}

watch(commandeOptions, (options) => {
  if (isApplyingSelections || isProcessingRouteChange) {
    return
  }
  if (selectedCommandeId.value && !options.includes(selectedCommandeId.value)) {
    isApplyingSelections = true
    selectedCommandeId.value = ''
    selectedPanelId.value = ''
    resetPieceFilters({ guard: false })
    isApplyingSelections = false
    replaceRouteWithSelections()
    flushPendingHandlers()
  }
})

watch(panelOptions, (options) => {
  if (isApplyingSelections || isProcessingRouteChange) {
    return
  }
  if (programs.value.length === 0 && options.length === 0) {
    return
  }
  if (selectedPanelId.value && !options.includes(selectedPanelId.value)) {
    isApplyingSelections = true
    selectedPanelId.value = ''
    resetPieceFilters({ guard: false })
    isApplyingSelections = false
    replaceRouteWithSelections()
    flushPendingHandlers()
  }
})

watch(pieceIdOptions, (options) => {
  if (isApplyingSelections || isProcessingRouteChange) {
    return
  }
  if (programs.value.length === 0 && options.length === 0) {
    return
  }
  if (selectedPieceId.value && !options.includes(selectedPieceId.value)) {
    isApplyingSelections = true
    resetPieceFilters({ guard: false })
    isApplyingSelections = false
    replaceRouteWithSelections()
    flushPendingHandlers()
  }
})

watch(currentProgram, (program) => {
  if (!program) {
    return
  }
  void ensureInstructions(program)
})

const mapPieceToProgram = (piece: ApiPiece): InstructionProgram => {   
  const now = new Date()   
  return {   
    id: piece.id.toString(),   
    pieceId: piece.id.toString(),   
    pieceName: piece.nom && piece.nom.trim().length > 0 ? piece.nom : `Piece ${piece.id}`,   
    panelId: piece.panneauId !== null ? piece.panneauId.toString() : 'N/A',   
    commandId: piece.commandeId.toString(),   
    operation: piece.classe && piece.classe.trim().length > 0 ? piece.classe : 'Operation non renseignee',   
    machine: 'Machine NC',   
    version: 'v1',   
    updatedAt: now.toLocaleDateString('fr-CA'),   
  }   
}      

const normalizeInstructionType = (value: string | null): 'gcode' | 'krl' | null => {   
  if (!value) {   
    return null   
  }   
  const normalized = value.trim().toLowerCase()   
  if (normalized === 'gcode' || normalized === 'g-code') {   
    return 'gcode'   
  }   
  if (normalized === 'krl' || normalized === 'frll') {   
    return 'krl'   
  }   
  return null   
}      

const normalizePseudoSteps = (raw: string | null): string[] => {
  if (!raw) {
    return []
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return []
  }

  const attemptJson = (() => {
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => String(item ?? '').trim())
            .filter((item) => item.length > 0)
        }
        if (typeof parsed === 'string') {
          return [parsed.trim()].filter((item) => item.length > 0)
        }
      } catch {
        // fall back to manual parsing
      }
    }
    return null
  })()

  if (attemptJson) {
    return attemptJson
  }

  const separatorPattern = /\r?\n|;/
  return trimmed
    .split(separatorPattern)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

const mapInstructionRecord = (record: {
  id: number
  typeInstruction: string | null
  machine: string | null
  stringlist: string | null
  pseudo: string | null
  timeCreation: string | null
}): InstructionDetails => ({
  id: record.id,
  type: normalizeInstructionType(record.typeInstruction),
  stringlist: (record.stringlist ?? '').trim(),
  pseudo: normalizePseudoSteps(record.pseudo),
  machine: (record.machine ?? '').trim(),
  timeCreation: record.timeCreation ?? ''
})

const selectInstructionForPanel = (records: ApiInstructionPanneau[]): InstructionDetails | null => {
  if (!records || records.length === 0) {
    return null
  }

  const mapped = records.map(mapInstructionRecord)

  const gcodeEntry = mapped.find((item) => item.type === 'gcode')
  if (gcodeEntry) {
    return gcodeEntry
  }
  const krlEntry = mapped.find((item) => item.type === 'krl')
  if (krlEntry) {
    return krlEntry
  }
  return mapped[0]
}

const selectInstructionForPiece = (record: ApiInstructionPiece | null): InstructionDetails | null => {
  if (!record) {
    return null
  }
  return mapInstructionRecord(record)
}

const fetchPanelInstructions = async (panelId: string) => {
  const setCacheValue = (value: InstructionDetails | null) => {
    panelInstructionsCache.value = {
      ...panelInstructionsCache.value,
      [panelId]: value,
    }
  }

  try {
    const { data, status } = await fetchJson<ApiInstructionPanneau[]>(
      `${apiBaseUrl}/api/panneaux/${panelId}/instructions`
    )
    if (status === 404 || !data || data.length === 0) {
      setCacheValue(null)
    } else {
      setCacheValue(selectInstructionForPanel(data))
    }
  } catch (error) {
    console.error('Erreur lors du chargement des instructions panneau', error)
    setCacheValue(null)
  }
}

const fetchPieceInstructions = async (pieceId: string) => {
  const setCacheValue = (value: InstructionDetails | null) => {
    pieceInstructionsCache.value = {
      ...pieceInstructionsCache.value,
      [pieceId]: value,
    }
  }

  try {
    const { data, status } = await fetchJson<ApiInstructionPiece | null>(
      `${apiBaseUrl}/api/pieces/${pieceId}/instructions`
    )
    if (status === 404 || !data) {
      setCacheValue(null)
    } else {
      setCacheValue(selectInstructionForPiece(data))
    }
  } catch (error) {
    console.error('Erreur lors du chargement des instructions piece', error)
    setCacheValue(null)
  }
}

const ensureInstructions = async (program: InstructionProgram) => {
  const pending: Promise<void>[] = []

  if (
    program.panelId &&
    program.panelId !== 'N/A' &&
    !Object.prototype.hasOwnProperty.call(panelInstructionsCache.value, program.panelId)
  ) {
    pending.push(fetchPanelInstructions(program.panelId))
  }

  if (!Object.prototype.hasOwnProperty.call(pieceInstructionsCache.value, program.pieceId)) {
    pending.push(fetchPieceInstructions(program.pieceId))
  }

  if (pending.length > 0) {
    await Promise.all(pending)
  }
}

const parseIntOrNull = (value: string | undefined): number | null => {   
  if (!value) {   
    return null   
  }   
  const parsed = Number.parseInt(value, 10)   
  return Number.isNaN(parsed) ? null : parsed   
}      

const fetchJson = async <T>(url: string) => {   
  const response = await fetch(url)   
  if (response.status === 404) {   
    return { data: null as T | null, status: 404 }   
  }   
  if (!response.ok) {   
    throw new Error(`Requete API echouee (${response.status})`)   
  }   
  const data = (await response.json()) as T   
  return { data, status: response.status }   
}      

const loadPrograms = async (requestedKey?: string) => {
  const datasetKey = requestedKey ?? getRouteDatasetKey()
  isLoading.value = true
  loadError.value = ''

  try {
    const pieces: ApiPiece[] = []
    panelInstructionsCache.value = {}
    pieceInstructionsCache.value = {}

    const [keyType, rawValue = ''] = datasetKey.split(':')

    const loadByCommande = async (commandeValue: string) => {
      const commandeId = parseIntOrNull(commandeValue)
      if (commandeId === null) {
        return
      }
      const { data } = await fetchJson<ApiPiece[] | TablePayload>(
        `${apiBaseUrl}/api/pieces/by-commande/${commandeId}`
      )
      const normalized = normalizePiecePayload(data)
      if (normalized.length > 0) {
        pieces.push(...normalized)
      }
    }

    const loadByPanel = async (panelValue: string) => {
      const panelId = parseIntOrNull(panelValue)
      if (panelId === null) {
        return
      }
      const { data } = await fetchJson<ApiPiece[] | TablePayload>(
        `${apiBaseUrl}/api/pieces/by-panneau/${panelId}`
      )
      const normalized = normalizePiecePayload(data)
      if (normalized.length > 0) {
        pieces.push(...normalized)
      }
      if (pieces.length > 0) {
        const panelCommandeId = pieces[0]?.commandeId ?? null
        if (panelCommandeId !== null && panelCommandeId !== undefined && panelCommandeId > 0) {
          const { data: relatedPieces } = await fetchJson<ApiPiece[] | TablePayload>(
            `${apiBaseUrl}/api/pieces/by-commande/${panelCommandeId}`
          )
          const normalizedRelated = normalizePiecePayload(relatedPieces)
          if (normalizedRelated.length > 0) {
            pieces.push(...normalizedRelated)
          }
        }
      }
    }

    const loadByPiece = async (pieceValue: string) => {
      const pieceId = parseIntOrNull(pieceValue)
      if (pieceId === null) {
        return
      }
      const { data, status } = await fetchJson<ApiPiece>(`${apiBaseUrl}/api/pieces/${pieceId}`)
      if (status === 404 || !data) {
        loadError.value = `Aucune piece avec l'identifiant ${pieceValue}.`
        return
      }
      pieces.push(data)
      const pieceCommandeId = data.commandeId
      if (pieceCommandeId !== null && pieceCommandeId !== undefined && pieceCommandeId > 0) {
        const { data: relatedPieces } = await fetchJson<ApiPiece[] | TablePayload>(
          `${apiBaseUrl}/api/pieces/by-commande/${pieceCommandeId}`
        )
        const normalizedRelated = normalizePiecePayload(relatedPieces)
        if (normalizedRelated.length > 0) {
          pieces.push(...normalizedRelated)
        }
      }
    }

    switch (keyType) {
      case 'commande':
        await loadByCommande(rawValue)
        break
      case 'panel':
        await loadByPanel(rawValue)
        break
      case 'piece':
        await loadByPiece(rawValue)
        break
      default: {
        const { data } = await fetchJson<ApiPiece[] | TablePayload>(`${apiBaseUrl}/api/pieces`)
        const normalized = normalizePiecePayload(data)
        if (normalized.length > 0) {
          pieces.push(...normalized)
        }
      }
    }

    if (pieces.length > 1) {
      const uniquePieces = new Map<number, ApiPiece>()
      for (const piece of pieces) {
        uniquePieces.set(piece.id, piece)
      }
      pieces.length = 0
      pieces.push(...uniquePieces.values())
    }

    programs.value = pieces.map(mapPieceToProgram)
    currentDatasetKey.value = datasetKey

    if (programs.value.length === 0 && !loadError.value) {
      loadError.value = 'Aucune piece ou panneau disponible pour cette selection.'
    }

    isProcessingRouteChange = true
    await nextTick()
    applySelectionsFromRoute()
  } catch (error) {
    console.error('Erreur lors du chargement des pieces', error)
    loadError.value = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des pieces.'
    programs.value = []
    currentDatasetKey.value = ''
  } finally {
    isLoading.value = false
    isProcessingRouteChange = false
    flushPendingHandlers()
    scheduleRouteSync()
  }
}

onMounted(() => {
  const initialKey = getRouteDatasetKey()
  void loadPrograms(initialKey)
})

const handleRouteQueryChange = () => {
  const nextKey = getRouteDatasetKey()
  if (nextKey === currentDatasetKey.value && programs.value.length > 0) {
    isProcessingRouteChange = true
    applySelectionsFromRoute()
    isProcessingRouteChange = false
    return
  }
  void loadPrograms(nextKey)
}

watch(
  () => [route.query.pieceId, route.query.panneau, route.query.commande],
  () => {
    if (isSyncingRoute) {
      queueMicrotask(() => {
        if (!isSyncingRoute) {
          handleRouteQueryChange()
        }
      })
      return
    }
    handleRouteQueryChange()
  }
)

watch(   
  () => [visibleTabs.value, route.query.tab] as const,   
  ([tabs, tabValue]) => {   
    const requested = typeof tabValue === 'string' ? (tabValue as TabKey) : undefined   
    const fallback = tabs.length > 0 ? tabs[0] : 'svg'   
    const next = requested && tabs.includes(requested) ? requested : fallback   
    if (activeTab.value !== next) {   
      activeTab.value = next   
    }   
  },   
  { immediate: true }   
)      
  
watch(activeTab, (tab) => {   
  if (!currentProgram.value) {
    return
  }
  const tabs = visibleTabs.value   
  if (tabs.length === 0 || !tabs.includes(tab)) {   
    return   
  }   
  const currentTab = typeof route.query.tab === 'string' ? (route.query.tab as TabKey) : undefined   
  if (currentTab === tab) {   
    return   
  }   
  const nextQuery = buildRouteQuery()
  nextQuery.tab = tab
  void router.replace({ query: nextQuery })   
})      

const copyGCode = () => {
  const programText = currentGcode.value.trim()
  if (programText.length === 0) {
    alert('Aucun programme disponible pour cette selection.')
    return
  }
  copyText(programText).catch((error) => {
    alert(
      `Erreur lors de la copie: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    )
  })
}

const downloadProgramFile = () => {
  const programText = currentGcode.value
  if (!programText || programText.trim().length === 0) {
    alert('Aucun programme disponible pour cette selection.')
    return
  }

  const extension = currentInstructionType.value === 'krl' ? 'krl' : 'gcode'
  const target = instructionTarget.value
  const prefix = (() => {
    if (!target) {
      return 'programme'
    }
    return `${target.kind === 'piece' ? 'piece' : 'panneau'}-${target.id}`
  })()

  const blob = new Blob([programText], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${prefix}.${extension}`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
const downloadStlPanneau = async (program: InstructionProgram) => {
  if (!program.panelId || program.panelId === 'N/A') {
    alert(`Panneau non disponible pour la piece ${program.pieceName}.`)
    return
  }
  try {
    const response = await fetch(`${apiBaseUrl}/api/panneaux/${program.panelId}/stl`)
    if (!response.ok) {
      throw new Error(`Telechargement impossible (HTTP ${response.status})`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `panneau-${program.panelId}.stl`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Erreur lors du telechargement du STL panneau.')
  }
}
const downloadStlPiece = async (program: InstructionProgram) => {
  if (!program.pieceId) {
    alert(`Piece non disponible pour ${program.pieceName}.`)
    return
  }
  try {
    const response = await fetch(`${apiBaseUrl}/api/pieces/${program.pieceId}/stl`)
    if (!response.ok) {
      throw new Error(`Telechargement impossible (HTTP ${response.status})`)
    }

    const blob = await response.blob()
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url

    link.download = `piece-${program.pieceId}.stl`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Erreur lors du telechargement du STL piece.')
  }

}



const downloadSvg = async (pieceId: string, panelId?: string) => {   
  try {   
    const response = await fetch(`${apiBaseUrl}/api/pieces/${pieceId}/svg`)   
    if (!response.ok) {   
      throw new Error(`Telechargement impossible (HTTP ${response.status})`)   
    }   
    const svgText = await response.text()   
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })   
    const url = URL.createObjectURL(blob)   
    const link = document.createElement('a')   
    link.href = url   
    link.download = panelId ? `piece-${pieceId}-panel-${panelId}.svg` : `piece-${pieceId}.svg`   
    document.body.appendChild(link)   
    link.click()   
    document.body.removeChild(link)   
    URL.revokeObjectURL(url)   
  } catch (error) {   
    alert(error instanceof Error ? error.message : 'Erreur lors du telechargement du SVG.')   
  }   
}   

const downloadPseudo = () => {
  if (currentPseudoSteps.value.length === 0) {
    alert('Aucun pseudo-code a exporter.')
    return
  }

  const q = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`

  const header = 'Step,Instruction'
  const lines = currentPseudoSteps.value.map((step, i) => `${q(i + 1)},${q(step)}`)
  const csv = [header, ...lines].join('\r\n') + '\r\n'

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url

  const target = instructionTarget.value
  const prefix = target ? `${target.kind === 'piece' ? 'piece' : 'panneau'}-${target.id}` : 'programme'
  a.download = `${prefix}-pseudo.csv`

  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

  return {
    activeTab,
    breadcrumbTitle,
    commandeOptions,
    copyGCode,
    currentGcode,
    currentProgram,
    displayMachine,
    downloadProgramFile,
    downloadPseudo,
    downloadStlPanneau,
    downloadStlPiece,
    downloadSvg,
    getTabLabel,
    isGcodeProgram,
    isLoading,
    loadError,
    onCommandeChange,
    onPanelChange,
    onPieceChange,
    panelOptions,
    pieceFiltersKey,
    pieceIdOptions,
    pieceNameOptions,
    programs,
    pseudoCode,
    selectedCommandeId,
    selectedPanelId,
    selectedPieceId,
    visibleTabs,
  }
}
