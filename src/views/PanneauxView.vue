<template>
  <section class="panneaux data-page">
    <header class="page-header">
      <h1>Panneaux</h1>
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
          @click="downloadPanneauxCsv"
          :disabled="isLoading || filteredRows.length === 0"
        >
          Telecharger
        </button>
      </div>
    </div>
    <div v-if="isLoading" class="data-state data-state-loading">Chargement des panneaux...</div>
    <div v-else-if="loadError" class="data-state data-state-error">{{ loadError }}</div>

    <div v-else class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr class="filters-row">
            <th
              v-for="columnKey in columnNames"
              :key="`filter-${columnKey}`"
              :class="getHeaderClass(columnKey)"
            >
              <template v-if="columnKey === 'Id'">
                <input
                  v-model.trim="searchTerm"
                  type="text"
                  placeholder="Rechercher"
                  aria-label="Recherche rapide"
                />
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
              <template v-else-if="columnKey === 'TypePanneauId'">
                <select v-model="filters.typePanneauId" aria-label="Filtrer par type de panneau">
                  <option value="">Tous</option>
                  <option
                    v-for="id in typeOptions"
                    :key="`type-${id}`"
                    :value="String(id)"
                  >
                    {{ id }}
                  </option>
                </select>
              </template>
            </th>
            <th class="actions-header actions-header--spacer"></th>
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
            <th scope="col" class="actions-header">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in filteredRows"
            :key="`panneau-${index}-${row.Id ?? row.id ?? ''}`"
          >
            <td
              v-for="columnKey in columnNames"
              :key="columnKey"
              :class="getCellClass(columnKey)"
            >
              {{ toDisplayString(row[columnKey] ?? row[columnKey.toLowerCase()]) }}
            </td>
            <td>
              <div class="table-actions">
                <button type="button" class="table-action details" @click="openDetails(row)">
                  Details
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredRows.length === 0" class="empty-row">
            <td :colspan="columnNames.length + 1" class="data-table-empty">
              Aucun panneau ne correspond aux filtres.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { downloadCsv } from '@/utils/csv'
import type { TablePayload, TableRow } from '@/types/table'

const tableData = ref<TablePayload>({ columns: [], rows: [] })
const isLoading = ref(false)
const loadError = ref('')
const commandeIds = ref<number[]>([])

const searchTerm = ref('')
const filters = reactive({
  commandeId: '' as string,
  typePanneauId: '' as string,
})

const route = useRoute()
const router = useRouter()

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'

const defaultOrder = ['Id', 'CommandeId', 'TypePanneauId']
const columnMetadata: Record<string, { label: string; headerClass?: string; cellClass?: string }> = {
  Id: { label: 'PanneauId', cellClass: 'code-cell' },
  CommandeId: { label: 'CommandeId', cellClass: 'code-cell' },
  TypePanneauId: { label: 'TypePanneauId', cellClass: 'code-cell' },
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
  const names = tableData.value.columns.map((column) => column.name)
  const ordered: string[] = []
  for (const key of defaultOrder) {
    if (names.includes(key)) ordered.push(key)
  }
  for (const name of names) {
    if (!ordered.includes(name)) ordered.push(name)
  }
  return ordered
})

const getHeaderClass = (key: string) => columnMetadata[key]?.headerClass ?? undefined
const getCellClass = (key: string) => columnMetadata[key]?.cellClass ?? undefined
const getColumnLabel = (key: string) => columnMetadata[key]?.label ?? key

const rows = computed<TableRow[]>(() => tableData.value.rows)

const commandeOptions = computed(() => {
  if (commandeIds.value.length > 0) return commandeIds.value
  const set = new Set<number>()
  rows.value.forEach((row) => {
    const value = Number(row['CommandeId'] ?? row['commandeId'])
    if (!Number.isNaN(value)) set.add(value)
  })
  return Array.from(set).sort((a, b) => a - b)
})

const typeOptions = computed(() => {
  const set = new Set<number>()
  rows.value.forEach((row) => {
    const value = Number(row['TypePanneauId'] ?? row['typePanneauId'])
    if (!Number.isNaN(value)) set.add(value)
  })
  return Array.from(set).sort((a, b) => a - b)
})

const filteredRows = computed(() => {
  const lowerSearch = searchTerm.value.trim().toLowerCase()
  return rows.value.filter((row) => {
    const id = toDisplayString(row['Id'] ?? row['id']).toLowerCase()
    const commande = toDisplayString(row['CommandeId'] ?? row['commandeId']).toLowerCase()
    const type = toDisplayString(row['TypePanneauId'] ?? row['typePanneauId']).toLowerCase()

    const matchesSearch =
      lowerSearch === '' ||
      id.includes(lowerSearch) ||
      commande.includes(lowerSearch) ||
      type.includes(lowerSearch)

    if (!matchesSearch) return false
    if (filters.commandeId && commande !== filters.commandeId.toLowerCase()) return false
    if (filters.typePanneauId && type !== filters.typePanneauId.toLowerCase()) return false

    return true
  })
})

const resetFilters = () => {
  searchTerm.value = ''
  filters.commandeId = ''
  filters.typePanneauId = ''
  updateRouteFromFilters()
}

const openDetails = (row: TableRow) => {
  const panneauId = toDisplayString(row['Id'] ?? row['id'])
  const commandeId = toDisplayString(row['CommandeId'] ?? row['commandeId'])
  void router.push({
    name: 'donnees',
    query: {
      from: 'panneaux',
      panneau: panneauId,
      commande: commandeId,
      tab: 'stl-panneau',
    },
  })
}

const downloadPanneauxCsv = () => {
  const keys = columnNames.value
  const headers = keys.map((key) => getColumnLabel(key))
  const csvRows = filteredRows.value.map((row) =>
    keys.map((key) => toDisplayString(row[key] ?? row[key.toLowerCase()]))
  )
  downloadCsv('panneaux.csv', headers, csvRows)
}

const fetchPanneaux = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    const commandeParam = typeof route.query.commande === 'string' ? route.query.commande.trim() : ''
    const response = await fetch(`${apiBaseUrl}/api/panneaux`)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Statut HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TablePayload
    tableData.value = payload
    filters.commandeId = commandeParam
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des panneaux'
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
}

const updateRouteFromFilters = () => {
  const nextQuery: Record<string, string> = {}
  if (filters.commandeId) nextQuery.commande = filters.commandeId

  const currentQuery = route.query
  const sameCommande = (currentQuery.commande ?? '') === (nextQuery.commande ?? '')

  if (sameCommande && Object.keys(currentQuery).length === Object.keys(nextQuery).length) return

  void router.replace({ query: nextQuery })
}

const refresh = () => {
  if (!isLoading.value) {
    void fetchPanneaux()
  }
}

onMounted(() => {
  syncFiltersFromRoute()
  void fetchPanneaux()
  void fetchCommandeIds()
})

watch(
  () => route.query.commande,
  () => {
    syncFiltersFromRoute()
    void fetchPanneaux()
  }
)

watch(
  () => filters.commandeId,
  () => {
    updateRouteFromFilters()
  }
)
</script>

<style scoped>
.panneaux.data-page {
  overflow-x: hidden;
  max-width: 100%;
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.filters {
  display: inline-flex;
  gap: 1rem;
  align-items: center;
}

.filters-row input,
.filters-row select {
  height: 42px;
  border-radius: 10px;
  border: 1px solid #d4d4d9;
  padding: 0 0.75rem;
  font-size: 0.95rem;
  background: #ffffff;
  width: 60%;
  box-sizing: border-box;
}

.filters-row select {
  min-width: 100px;
}

.filters-row th {
  padding: 0.5rem;
  font-family:
    Inter,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    'Fira Sans',
    'Droid Sans',
    'Helvetica Neue',
    sans-serif;
}

.actions-header {
  width: 200px;
  max-width: 100%;
}

.actions-header--spacer {
  pointer-events: none;
}

.panneaux .data-table-wrapper {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 240px);
  padding-bottom: 1.25rem;
  box-sizing: border-box;
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
  padding: 0.45rem 0.75rem;
  font-size: 0.85rem;
  font-weight: 600;
  color: #ff8c32;
  background: #ffffff;
  border: 1px solid #ff8c32;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.table-action:hover {
  background-color: #ffcfab;
  border-color: #ff8c32;
}

@media (max-width: 1024px) {
  .filters {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 0.5rem;
  }

  .filters-row input,
  .filters-row select {
    width: 100%;
    min-width: 0;
  }

  .actions-header {
    width: auto;
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
</style>
