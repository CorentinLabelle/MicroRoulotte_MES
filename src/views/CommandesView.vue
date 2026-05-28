<template>
  <section class="commandes data-page">
    <header class="page-header">
      <h1>{{ breadcrumbTitle }}</h1>
    </header>

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
        @click="downloadCommandesCsv"
        :disabled="isLoading || filteredRows.length === 0"
      >
        Telecharger
      </button>
    </div>

    <div v-if="isLoading" class="data-state data-state-loading">Chargement des commandes...</div>
    <div v-else-if="loadError" class="data-state data-state-error">{{ loadError }}</div>

    <div v-else class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr class="filters-row">
            <th>
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
            </th>
            <th>
              <select v-model="filters.utilisateurId" aria-label="Filtrer par utilisateur">
                <option value="">Tous</option>
                <option
                  v-for="id in utilisateurOptions"
                  :key="`usr-${id}`"
                  :value="String(id)"
                >
                  {{ id }}
                </option>
              </select>
            </th>
            <th>
              <select v-model="filters.designUtilisateurId" aria-label="Filtrer par design utilisateur">
                <option value="">Tous</option>
                <option
                  v-for="id in designUtilisateurOptions"
                  :key="`design-${id}`"
                  :value="String(id)"
                >
                  {{ id }}
                </option>
              </select>
            </th>
            <th class="actions-header actions-header--spacer"></th>
          </tr>
          <tr>
            <th
              v-for="columnKey in orderedColumnNames"
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
            :key="`commande-${index}-${row.Id ?? row.id ?? ''}`"
          >
            <td
              v-for="columnKey in orderedColumnNames"
              :key="columnKey"
              :class="getCellClass(columnKey)"
            >
              <span v-if="columnKey === 'Id' || columnKey === 'id'" class="order-id">
                {{ toDisplayString(row[columnKey] ?? row[columnKey.toLowerCase()]) }}
              </span>
              <template v-else>
                {{ toDisplayString(row[columnKey] ?? row[columnKey.toLowerCase()]) }}
              </template>
            </td>
            <td>
              <div class="table-actions">
                <button type="button" class="table-action" @click="openPieces(row)">
                  Pieces
                </button>
                <button type="button" class="table-action" @click="openPanneaux(row)">
                  Panneaux
                </button>
                <button type="button" class="table-action table-action--nesting" @click="openNesting(row)">
                  Nesting
                </button>
                <button type="button" class="table-action table-action--details" @click="openDetails(row)">
                  Details
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="filteredRows.length === 0" class="empty-row">
            <td :colspan="orderedColumnNames.length + 1" class="data-table-empty">
              Aucune commande ne correspond aux filtres.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <NestingDialog
      :open="nestingConfirm.open"
      :commande-id="nestingConfirm.id"
      :loading="nestingConfirm.loading"
      :error="nestingConfirm.error"
      @cancel="cancelNesting"
      @confirm="confirmNesting"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { downloadCsv } from '@/utils/csv'
import type { TablePayload, TableRow } from '@/types/table'
import NestingDialog from '@/components/NestingDialog.vue'

const tableData = ref<TablePayload>({ columns: [], rows: [] })
const isLoading = ref(false)
const loadError = ref('')

const filters = reactive({
  commandeId: '' as string,
  utilisateurId: '' as string,
  designUtilisateurId: '' as string,
})

const nestingConfirm = reactive({
  open: false,
  id: '' as string,
  loading: false,
  error: '' as string,
})

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'

const breadcrumbTitle = computed(() => 'Commandes')

const defaultCommandeOrder = ['Id', 'UtilisateurId', 'DesignUtilisateurId']
const commandeColumnMetadata: Record<string, { label: string; headerClass?: string; cellClass?: string }> = {
  Id: { label: 'Id', headerClass: 'cell-id', cellClass: 'cell-id' },
  UtilisateurId: { label: 'UtilisateurId', headerClass: 'cell-id', cellClass: 'cell-id' },
  DesignUtilisateurId: { label: 'DesignUtilisateurId', headerClass: 'cell-id', cellClass: 'cell-id' },
  Status: { label: 'Status', headerClass: 'status-cell', cellClass: 'status-cell' },
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

const orderedColumnNames = computed(() => {
  const names = tableData.value.columns.map((column) => column.name)
  const ordered: string[] = []
  for (const key of defaultCommandeOrder) {
    if (names.includes(key)) ordered.push(key)
  }
  for (const name of names) {
    if (!ordered.includes(name)) ordered.push(name)
  }
  return ordered
})

const getHeaderClass = (key: string) => commandeColumnMetadata[key]?.headerClass ?? undefined
const getCellClass = (key: string) => commandeColumnMetadata[key]?.cellClass ?? undefined
const getColumnLabel = (key: string) => commandeColumnMetadata[key]?.label ?? key

const rows = computed<TableRow[]>(() => tableData.value.rows)

const commandeOptions = computed(() => {
  const ids = rows.value
    .map((row) => Number(row['Id'] ?? row['id']))
    .filter((value) => !Number.isNaN(value))
  return Array.from(new Set(ids)).sort((a, b) => a - b)
})

const utilisateurOptions = computed(() => {
  const ids = rows.value
    .map((row) => Number(row['UtilisateurId'] ?? row['utilisateurId']))
    .filter((value) => !Number.isNaN(value))
  return Array.from(new Set(ids)).sort((a, b) => a - b)
})

const designUtilisateurOptions = computed(() => {
  const ids = rows.value
    .map((row) => Number(row['DesignUtilisateurId'] ?? row['designUtilisateurId']))
    .filter((value) => !Number.isNaN(value))
  return Array.from(new Set(ids)).sort((a, b) => a - b)
})

const filteredRows = computed(() => {
  return rows.value.filter((row) => {
    const id = toDisplayString(row['Id'] ?? row['id']).toLowerCase()
    const utilisateur = toDisplayString(row['UtilisateurId'] ?? row['utilisateurId']).toLowerCase()
    const design = toDisplayString(row['DesignUtilisateurId'] ?? row['designUtilisateurId']).toLowerCase()

    if (filters.commandeId && id !== filters.commandeId) return false
    if (filters.utilisateurId && utilisateur !== filters.utilisateurId.toLowerCase()) return false
    if (filters.designUtilisateurId && design !== filters.designUtilisateurId.toLowerCase()) return false

    return true
  })
})

const resetFilters = () => {
  filters.commandeId = ''
  filters.utilisateurId = ''
  filters.designUtilisateurId = ''
}

const router = useRouter()

const openPieces = (row: TableRow) => {
  const id = toDisplayString(row['Id'] ?? row['id'])
  if (!id) return
  void router.push({ name: 'pieces', query: { commande: id } })
}

const openPanneaux = (row: TableRow) => {
  const id = toDisplayString(row['Id'] ?? row['id'])
  if (!id) return
  void router.push({ name: 'panneaux', query: { commande: id } })
}

const openNesting = (row: TableRow) => {
  const id = toDisplayString(row['Id'] ?? row['id'])
  if (!id) return
  nestingConfirm.id = id
  nestingConfirm.open = true
  nestingConfirm.error = ''
}

const cancelNesting = () => {
  nestingConfirm.open = false
  nestingConfirm.loading = false
  nestingConfirm.error = ''
}

const confirmNesting = async () => {
  if (!nestingConfirm.id || nestingConfirm.loading) return
  nestingConfirm.loading = true
  nestingConfirm.error = ''

  try {
    const response = await fetch(`${apiBaseUrl}/api/commandes/${nestingConfirm.id}/nesting`, {
      method: 'POST',
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Erreur HTTP ${response.status}`)
    }
    await fetchCommandes()
    cancelNesting()
  } catch (error) {
    nestingConfirm.error = error instanceof Error ? error.message : 'Impossible de lancer le nesting'
    nestingConfirm.loading = false
  }
}

const openDetails = (row: TableRow) => {
  const id = toDisplayString(row['Id'] ?? row['id'])
  if (!id) return
  void router.push({
    name: 'donnees',
    query: { commande: id, from: 'commandes' },
  })
}

const downloadCommandesCsv = () => {
  const keys = orderedColumnNames.value
  const headers = keys.map((key) => getColumnLabel(key))
  const csvRows = filteredRows.value.map((row) =>
    keys.map((key) => toDisplayString(row[key] ?? row[key.toLowerCase()]))
  )
  downloadCsv('commandes.csv', headers, csvRows)
}

async function fetchCommandes() {
  isLoading.value = true
  loadError.value = ''

  try {
    const response = await fetch(`${apiBaseUrl}/api/commandes`)
    if (!response.ok) {
      throw new Error(`Requete API echouee (status ${response.status})`)
    }
    const payload = (await response.json()) as TablePayload
    tableData.value = payload
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des commandes'
    tableData.value = { columns: [], rows: [] }
  } finally {
    isLoading.value = false
  }
}

const refresh = () => {
  if (!isLoading.value) {
    void fetchCommandes()
  }
}

onMounted(() => {
  void fetchCommandes()
})
</script>

<style scoped>
.commandes.data-page {
  margin: 0 auto;
  padding: 0.75rem;
}

.filters {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 1rem;
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

.filters-row select {
  height: 42px;
  border-radius: 10px;
  border: 1px solid #d4d4d9;
  padding: 0 0.75rem;
  font-size: 0.85rem;
  background: #ffffff;
  min-width: 70px;
  width: 100%;
  box-sizing: border-box;
}

.data-table {
  table-layout: auto;
}
.data-table-wrapper {
  max-height: calc(100vh - 230px);
  overflow: auto;
}

.cell-id {
  width: 32px;
  min-width: 32px;
}

.status-cell {
  width: 42px;
  min-width: 42px;
}

.actions-header {
  width: 340px;
  max-width: 100%;
}

.actions-header--spacer {
  pointer-events: none;
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
  gap: 0.35rem;
  flex-wrap: wrap;
}

.table-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.5rem;
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: #394dff;
  background: #ffffff;
  border: 1px solid #394dff;
  border-radius: 8px;
  cursor: pointer;
  text-decoration: none;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.table-action:hover {
  background-color: #f0f3ff;
  border-color: #395aff;
}

.table-action--nesting {
  background: #ffffff;
  border-color: #0f9d58;
  color: #0f9d58;
}

.table-action--nesting:hover {
  background: #abffd6;
  border-color: #0c8048;
}

.table-action--details {
  background: #ffffff;
  border-color: #ff8c32;
  color: #ff8c32;
}

.table-action--details:hover {
  background: #ffcda7;
  border-color: #e07929;
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

  .filters-row select {
    min-width: 0;
  }

  .cell-id,
  .status-cell,
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
