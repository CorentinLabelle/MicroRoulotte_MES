<template>
  <section class="pieces data-page">
    <header class="page-header">
      <h1>{{ breadcrumbTitle }}</h1>
    </header>

    <div class="toolbar">
      <div class="filters">
        <button type="button" class="refresh" @click="refresh" :disabled="isLoading">
          Actualiser
        </button>
        <button type="button" class="refresh" @click="resetFilters" :disabled="isLoading">
          Reinitialiser filtres
        </button>
        <button
          type="button"
          class="refresh"
          @click="downloadPiecesCsv"
          :disabled="isLoading || filteredRows.length === 0"
        >
          Telecharger
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="data-state data-state-loading">Chargement des pieces...</div>
    <div v-else-if="loadError" class="data-state data-state-error">{{ loadError }}</div>

    <div v-else class="data-table-wrapper">
      <table class="data-table pieces-table">
        <thead>
          <tr class="filters-row">
            <th
              v-for="columnKey in columnNames"
              :key="`filter-${columnKey}`"
              :class="getHeaderClass(columnKey)"
            >
              <template v-if="columnKey === 'Nom'">
                <input
                  v-model.trim="filters.nom"
                  type="text"
                  placeholder="Nom contient..."
                  aria-label="Filtrer par nom"
                />
              </template>
              <template v-else-if="columnKey === 'Classe'">
                <select v-model="filters.classe" aria-label="Filtrer par classe">
                  <option value="">Toutes</option>
                  <option
                    v-for="classe in classeOptions"
                    :key="`classe-${classe}`"
                    :value="classe"
                  >
                    {{ classe || '-' }}
                  </option>
                </select>
              </template>
              <template v-else-if="columnKey === 'CommandeId'">
                <select v-model="filters.commandeId" aria-label="Filtrer par commande">
                  <option value="">Tous</option>
                  <option
                    v-for="id in commandeOptions"
                    :key="`cmd-${id}`"
                    :value="String(id)"
                  >
                    {{ id }}
                  </option>
                </select>
              </template>
              <template v-else-if="columnKey === 'PanneauId'">
                <select v-model="filters.panneauId" aria-label="Filtrer par panneau">
                  <option value="">Tous</option>
                  <option
                    v-for="id in panneauOptions"
                    :key="`pan-${id}`"
                    :value="String(id)"
                  >
                    {{ id }}
                  </option>
                  <option value="null">Aucun</option>
                </select>
              </template>
            </th>
            <th class="actions-cell actions-cell--spacer"></th>
          </tr>
          <tr>
            <th
              v-for="columnKey in columnNames"
              :key="columnKey"
              scope="col"
              :class="getHeaderClass(columnKey)"
            >
              {{ getColumnLabel(columnKey) }}
            </th>
            <th scope="col" class="actions-cell">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in filteredRows"
            :key="`piece-${index}-${row.Id ?? row.id ?? ''}`"
          >
            <td
              v-for="columnKey in columnNames"
              :key="columnKey"
              :class="getCellClass(columnKey)"
              :data-label="getColumnLabel(columnKey)"
            >
              {{
                pieceColumnMetadata[columnKey]?.formatter?.(row) ??
                  toDisplayString(row[columnKey] ?? row[columnKey.toLowerCase()])
              }}
            </td>
            <td data-label="Actions">
              <div class="table-actions">
                <button
                  type="button"
                  class="table-action download"
                  @click.stop="downloadSvg(row)"
                  :disabled="isRowDownloadingSvg(row) || !getRowId(row)"
                >
                  {{ isRowDownloadingSvg(row) ? 'Telechargement...' : 'Telecharger SVG' }}
                </button>
                <button
                  type="button"
                  class="table-action details"
                  @click="openDetails(row)"
                >
                  Details
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredRows.length === 0" class="empty-row">
            <td :colspan="columnNames.length + 1" class="data-table-empty">
              Aucune piece ne correspond aux filtres.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { downloadCsv } from '@/utils/csv'
import type { TablePayload, TableRow } from '@/types/table'

const tableData = ref<TablePayload>({ columns: [], rows: [] })
const isLoading = ref(false)
const loadError = ref('')
const commandeIds = ref<number[]>([])

const searchTerm = ref('')
const filters = reactive({
  nom: '' as string,
  classe: '' as string,
  commandeId: '' as string,
  panneauId: '' as string,
})

const route = useRoute()
const router = useRouter()

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'

const breadcrumbTitle = computed(() => {
  const parts: string[] = []
  const commandeParam = typeof route.query.commande === 'string' ? route.query.commande.trim() : ''
  if (commandeParam) parts.push(`Commande ${commandeParam}`)
  const panneauParam = typeof route.query.panneau === 'string' ? route.query.panneau.trim() : ''
  if (panneauParam) parts.push(`Panneau ${panneauParam}`)
  parts.push('Pieces')
  return parts.join(' - ')
})

const defaultPieceOrder = ['Id', 'Nom', 'Classe', 'CommandeId', 'PanneauId']
const pieceColumnMetadata: Record<string, { label: string; headerClass?: string; cellClass?: string; formatter?: (row: TableRow) => string }> = {
  Id: { label: 'PieceId', headerClass: 'pieceid-cell', cellClass: 'pieceid-cell' },
  Nom: { label: 'Nom', headerClass: 'nom-cell', cellClass: 'nom-cell' },
  Classe: {
    label: 'Classe',
    headerClass: 'classe-cell',
    cellClass: 'classe-cell',
    formatter: (row) => toDisplayString(row['Classe'] ?? row['classe'] ?? '-'),
  },
  CommandeId: { label: 'CommandeId', headerClass: 'id-cell', cellClass: 'id-cell' },
  PanneauId: {
    label: 'PanneauId',
    headerClass: 'id-cell',
    cellClass: 'id-cell',
    formatter: (row) => toDisplayString(row['PanneauId'] ?? row['panneauId'] ?? '-'),
  },
}

const toDisplayString = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

const columnNames = computed(() => {
  const names = tableData.value.columns
    .map((column) => column.name)
    .filter((name) => name.toLowerCase() !== 'svg') // la colonne SVG n'est plus transmise par l'API
  const ordered: string[] = []
  for (const key of defaultPieceOrder) {
    if (names.includes(key)) ordered.push(key)
  }
  for (const name of names) {
    if (!ordered.includes(name)) ordered.push(name)
  }
  return ordered
})

const getHeaderClass = (key: string) => pieceColumnMetadata[key]?.headerClass ?? undefined
const getCellClass = (key: string) => pieceColumnMetadata[key]?.cellClass ?? undefined
const getColumnLabel = (key: string) => pieceColumnMetadata[key]?.label ?? key

const rows = computed<TableRow[]>(() => tableData.value.rows)

const classeOptions = computed(() => {
  const set = new Set<string>()
  rows.value.forEach((row) => {
    const value = toDisplayString(row['Classe'] ?? row['classe'] ?? '')
    if (value) set.add(value)
  })
  return Array.from(set).sort((a, b) => a.localeCompare(b))
})

const commandeOptions = computed(() => {
  if (commandeIds.value.length > 0) return commandeIds.value
  const set = new Set<number>()
  rows.value.forEach((row) => {
    const value = Number(row['CommandeId'] ?? row['commandeId'])
    if (!Number.isNaN(value)) set.add(value)
  })
  return Array.from(set).sort((a, b) => a - b)
})

const panneauOptions = computed(() => {
  const set = new Set<number>()
  rows.value.forEach((row) => {
    const raw = row['PanneauId'] ?? row['panneauId']
    const value = raw === null || raw === undefined ? null : Number(raw)
    if (value !== null && !Number.isNaN(value)) set.add(value)
  })
  return Array.from(set).sort((a, b) => a - b)
})

const filteredRows = computed(() => {
  const lowerSearch = searchTerm.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    const nomValue = toDisplayString(row['Nom'] ?? row['nom']).toLowerCase()
    const classeValue = toDisplayString(row['Classe'] ?? row['classe']).toLowerCase()
    const commandeValue = toDisplayString(row['CommandeId'] ?? row['commandeId'])
    const panneauRaw = row['PanneauId'] ?? row['panneauId']
    const panneauValue = panneauRaw === null || panneauRaw === undefined ? 'null' : String(panneauRaw)

    const matchesSearch =
      lowerSearch === '' ||
      nomValue.includes(lowerSearch) ||
      classeValue.includes(lowerSearch) ||
      commandeValue.toLowerCase().includes(lowerSearch) ||
      panneauValue.toLowerCase().includes(lowerSearch)

    if (!matchesSearch) return false
    if (filters.nom && !nomValue.includes(filters.nom.toLowerCase())) return false
    if (filters.classe && classeValue !== filters.classe.toLowerCase()) return false
    if (filters.commandeId && commandeValue !== filters.commandeId) return false
    if (filters.panneauId) {
      if (filters.panneauId === 'null') {
        if (panneauRaw !== null && panneauRaw !== undefined) return false
      } else if (panneauValue !== filters.panneauId) {
        return false
      }
    }

    return true
  })
})

const resetFilters = () => {
  searchTerm.value = ''
  filters.nom = ''
  filters.classe = ''
  filters.commandeId = ''
  filters.panneauId = ''
  downloadingSvgId.value = null
  updateRouteFromFilters()
}

const openDetails = (row: TableRow) => {
  const id = toDisplayString(row['Id'] ?? row['id'])
  const commande = toDisplayString(row['CommandeId'] ?? row['commandeId'])
  const query: Record<string, string> = { from: 'pieces' }
  if (id) query.pieceId = id
  if (commande) query.commande = commande
  const nom = toDisplayString(row['Nom'] ?? row['nom']).trim()
  if (nom) query.nom = nom
  const classe = toDisplayString(row['Classe'] ?? row['classe']).trim()
  if (classe) query.class = classe
  const panneau = toDisplayString(row['PanneauId'] ?? row['panneauId']).trim()
  if (panneau) query.panneau = panneau

  // Redirige vers la page de détails/visualisation avec filtrage par pièce
  void router.push({ name: 'donnees', query })
}

const getRowId = (row: TableRow) => toDisplayString(row['Id'] ?? row['id'])
const downloadingSvgId = ref<string | null>(null)

const isRowDownloadingSvg = (row: TableRow) => downloadingSvgId.value === getRowId(row)

const downloadSvg = async (row: TableRow) => {
  const id = getRowId(row)
  if (!id) return

  downloadingSvgId.value = id
  try {
    const response = await fetch(`${apiBaseUrl}/api/pieces/${Number(id)}/svg`)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Statut HTTP ${response.status}`)
    }
    const svgContent = await response.text()
    const blob = new Blob([svgContent], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `piece-${id}.svg`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Telechargement du SVG impossible'
    window.alert(message)
  } finally {
    downloadingSvgId.value = null
  }
}

const downloadPiecesCsv = () => {
  const keys = columnNames.value
  const headers = keys.map((key) => getColumnLabel(key))
  const csvRows = filteredRows.value.map((row) => keys.map((key) => toDisplayString(row[key] ?? row[key.toLowerCase()])))
  downloadCsv('pieces.csv', headers, csvRows)
}

const fetchPieces = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    const response = await fetch(`${apiBaseUrl}/api/pieces`)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Statut HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TablePayload
    tableData.value = payload
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des pieces'
    tableData.value = { columns: [], rows: [] }
  } finally {
    isLoading.value = false
  }
}

const fetchCommandeIds = async () => {
  try {
    const response = await fetch(`${apiBaseUrl}/api/commandes`)
    if (!response.ok) return
    const payload = (await response.json()) as TablePayload
    const ids = payload.rows
      .map((row) => Number(row['Id'] ?? row['id']))
      .filter((value) => !Number.isNaN(value))
    commandeIds.value = Array.from(new Set(ids)).sort((a, b) => a - b)
  } catch (error) {
    console.error('Impossible de charger les commandes pour les filtres', error)
  }
}

const syncFiltersFromRoute = () => {
  filters.commandeId = typeof route.query.commande === 'string' ? route.query.commande.trim() : ''
  filters.panneauId = typeof route.query.panneau === 'string' ? route.query.panneau.trim() : ''
}

const updateRouteFromFilters = () => {
  const nextQuery: Record<string, string> = {}
  if (filters.commandeId) nextQuery.commande = filters.commandeId
  if (filters.panneauId && filters.panneauId !== 'null') nextQuery.panneau = filters.panneauId

  const currentQuery = route.query
  const sameCommande = (currentQuery.commande ?? '') === (nextQuery.commande ?? '')
  const currentPanneau = typeof currentQuery.panneau === 'string' ? currentQuery.panneau : ''
  const samePanneau = currentPanneau === (nextQuery.panneau ?? '')

  if (sameCommande && samePanneau && Object.keys(currentQuery).length === Object.keys(nextQuery).length) return

  void router.replace({ query: nextQuery })
}

const refresh = async () => {
  await fetchPieces()
}

onMounted(() => {
  syncFiltersFromRoute()
  void fetchPieces()
  void fetchCommandeIds()
})

watch(
  () => [route.query.commande, route.query.panneau],
  () => {
    syncFiltersFromRoute()
    void fetchPieces()
  }
)

watch(
  () => [filters.commandeId, filters.panneauId],
  () => {
    updateRouteFromFilters()
  }
)
</script>

<style scoped>
.page-header h1 {
  margin-bottom: 0.05rem;
}

.pieces.data-page {
  overflow-x: hidden;
  max-width: 100vw;
  padding: 0.75rem;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 0;
  background: #f5f5f5;
}

.filters {
  display: inline-flex;
  gap: 1rem;
  align-items: center;
}

.refresh {
  height: 42px;
  padding: 0 1.25rem;
  border-radius: 10px;
  border: 1px solid #d4d4d9;
  background: #ffffff;
  font-size: 0.9rem;
  font-weight: 600;
  color: #2f343c;
  cursor: pointer;
}

.refresh:disabled {
  opacity: 0.6;
  cursor: default;
}

.actions-cell {
  min-width: 140px;
}

.actions-cell--spacer {
  pointer-events: none;
}

.pieceid-cell {
  min-width: 40px;
  width: 70px;
  max-width: 80px;
}

.id-cell {
  min-width: 110px;
  width: 110px;
  max-width: 110px;
}

.classe-cell {
  min-width: 110px;
  width: 130px;
  max-width: 150px;
}

.nom-cell {
  min-width: 270px;
}

.pieces .data-table-wrapper {
  width: 100%;
  padding-left: 1rem;
  padding-right: 1rem;
  margin-top: 0;
  padding-top: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 260px);
  padding-bottom: 1rem;
  box-sizing: border-box;
}

.pieces-table {
  table-layout: auto;
  width: 100%;
}

.pieces-table .actions-cell {
  min-width: 250px;
  width: 260px;
  max-width: 320px;
}

.pieces-table th,
.pieces-table td {
  padding: 0.65rem 0.5rem;
}

.pieces-table thead .filters-row th {
  padding-top: 0.0;
  padding-bottom: 0.0;
}

.filters-row input,
.filters-row select {
  height: 42px;
  border-radius: 10px;
  border: 1px solid #d4d4d9;
  padding: 0 0.95rem;
  font-size: 0.95rem;
  background: #ffffff;
  width: 100%;
  box-sizing: border-box;
}

.filters-row select {
  min-width: 100px;
}

.data-state {
  padding: 2rem;
  border-radius: 12px;
  border: 1px dashed #d4d4d9;
  text-align: center;
  font-size: 1rem;
  color: #4b4b52;
}

.data-state-loading {
  background: #f5f7ff;
}

.data-state-error {
  background: #fff1f0;
  color: #d14343;
  border-color: #f1b0af;
}

.table-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.table-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem 0.75rem;
  background: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ff8c32;
  border: 1px solid #ffc192;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.table-action.download {
  color: #333333;
  border: 1px solid #000000;
  min-width: 150px;
}

.table-action:disabled {
  opacity: 0.6;
  cursor: default;
}

.table-action:hover:not(:disabled) {
  background-color: #ffc08f;
  border-color: #ff8c32;
}

@media (max-width: 1024px) {
  .filters {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0.5rem;
  }

  .refresh {
    flex: 1 1 180px;
  }

  .pieceid-cell,
  .classe-cell,
  .nom-cell,
  .id-cell,
  .actions-cell {
    min-width: 0;
    width: auto;
  }

  .filters-row input,
  .filters-row select {
    min-width: 0;
  }

  .table-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0.5rem;
  }

  .table-action {
    flex: 1 1 48%;
    min-width: 140px;
  }
}

@media (max-width: 640px) {
  .filters {
    flex-direction: column;
    align-items: stretch;
  }

  .refresh {
    width: 100%;
  }

  .data-table thead th,
  .data-table tbody td {
    padding: 0.75rem;
  }
}

@media (max-width: 1100px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .filters {
    justify-content: flex-end;
  }

  .pieces-table {
    display: block;
    width: 100%;
  }

  .pieces-table thead {
    display: none;
  }

  .pieces-table tbody {
    display: block;
    width: 100%;
  }

  .pieces-table tbody tr {
    display: block;
    width: 100%;
    margin-bottom: 1rem;
    border: 1px solid #e2e2e8;
    border-radius: 12px;
    background: #ffffff;
    overflow: hidden;
  }

.pieces-table tbody td {
  display: grid;
  grid-template-columns: 120px 1fr;
  align-items: center;
  padding: 0.6rem 0.75rem;
  border-top: 1px solid #f0f0f5;
  width: 100%;
  word-break: break-word;
}

  .pieces-table tbody td:first-child {
    border-top: none;
  }

  .pieces-table tbody td::before {
    content: attr(data-label);
    font-weight: 600;
    color: #5a5a64;
    padding-right: 0.5rem;
  }

  .table-actions {
    justify-content: flex-start;
  }
}
</style>
