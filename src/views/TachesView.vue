<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn, TablePayload, TableRow } from '../types/table'

type ExecutableParam = { name: string; flag: string | null; defaultValue: string | null; isRequired: boolean; description: string | null }
type ExecutableInfo = { priority: number; parameters: ExecutableParam[] }
type ExecutableInfoMap = Record<string, ExecutableInfo>

const priorityLabel = (p: number): string => p === 0 ? 'critique' : p === 2 ? 'faible' : 'normal'

const tableData = ref<TablePayload>({ columns: [], rows: [] })
const executableParams = ref<ExecutableInfoMap>({})
const tooltip = ref<{ stepName: string; commandeId: string | null; x: number; y: number } | null>(null)
const isLoading = ref(false)
const loadError = ref('')
const errorDialogOpen = ref(false)
const selectedErrorMessage = ref('')
const scheduleDialogOpen = ref(false)
const scheduleDialogError = ref('')
const scheduleDialogSaving = ref(false)
const selectedQueueId = ref<number | null>(null)
const selectedIds = ref<Set<number>>(new Set())
const plannedDate = ref('')
const plannedTime = ref('')

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'
let pollHandle: number | undefined
const router = useRouter()

const hiddenColumns = new Set(['RunMode', 'EnqueuedAt', 'TimeCreation', 'TimeUpdate', 'LastError'])

const columnLabels: Record<string, string> = {
  Id: 'N°',
  CommandeId: 'Commande',
  StepName: 'Étape',
  Status: 'Statut',
  Priority: 'Priorité',
  ScheduledFor: 'Planifié le',
  StartedAt: 'Démarré le',
  CompletedAt: 'Terminé le',
  Attempts: 'Tentatives',
}
const getColumnLabel = (name: string): string => columnLabels[name] ?? name

const statusLabels: Record<string, string> = {
  pending: 'En attente',
  enqueued: 'En attente',
  running: 'En cours',
  done: 'Terminé',
  failed: 'Échoué',
  cancelled: 'Annulé',
}
const formatStatus = (value: unknown): string => {
  const s = toDisplayString(value).trim()
  return statusLabels[s.toLowerCase()] ?? s
}
const columns = computed<TableColumn[]>(() =>
  tableData.value.columns.filter((c) => !hiddenColumns.has(c.name))
)
const rows = computed<TableRow[]>(() => tableData.value.rows)
const errorColumnName = computed(() => {
  const column = columns.value.find((col) => col.name.toLowerCase().includes('error'))
  return column?.name ?? null
})
const isErrorColumn = (name: string) => errorColumnName.value === name
const getColumnClass = (name: string) => ({
  'id-column': name === 'Id',
  'commande-column': name === 'CommandeId',
  'runmode-column': name === 'RunMode',
  'status-column': name === 'Status',
  'attempts-column': name === 'Attempts',
  'step-column': name === 'StepName',
  'queue-column': name === 'Priority',
  'datetime-column':
    name === 'ScheduledFor' ||
    name === 'EnqueuedAt' ||
    name === 'StartedAt' ||
    name === 'CompletedAt' ||
    name === 'TimeCreation' ||
    name === 'TimeUpdate',
  'error-cell': isErrorColumn(name),
})
const isDateTimeColumn = (column: TableColumn) => {
  const type = (column.dataType ?? '').toLowerCase()
  return type.includes('date') || type.includes('time')
}

const toTwoDigits = (value: number) => String(value).padStart(2, '0')
const parseUtcDate = (value: unknown): Date | null => {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  const s = String(value)
  const date = new Date(s)
  return Number.isNaN(date.getTime()) ? null : date
}
const formatDateTimeForCell = (value: unknown) => {
  if (value === null || value === undefined) return ''
  const date = parseUtcDate(value)
  if (!date) return toDisplayString(value)

  const yyyy = date.getFullYear()
  const mm = toTwoDigits(date.getMonth() + 1)
  const dd = toTwoDigits(date.getDate())
  const hh = toTwoDigits(date.getHours())
  const min = toTwoDigits(date.getMinutes())
  const ss = toTwoDigits(date.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
}

const toDisplayString = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

const filteredRows = computed(() => rows.value)

const getRowError = (row: TableRow) => {
  if (!errorColumnName.value) return ''
  return toDisplayString(row[errorColumnName.value]).trim()
}

const getStringField = (row: TableRow, key: string) => {
  const direct = row[key]
  const lower = row[key.toLowerCase()]
  return toDisplayString(direct ?? lower).trim()
}

const getStepName = (row: TableRow) => getStringField(row, 'StepName').toLowerCase()
const isDoneRow = (row: TableRow) => {
  const status = getStringField(row, 'Status').toLowerCase()
  return status === 'done' || status === 'completed' || status === 'termine'
}

const isFailedRow = (row: TableRow) => {
  const status = getStringField(row, 'Status').toLowerCase()
  return status === 'failed' || status === 'error' || status === 'erreur'
}

const isDeletableRow = (row: TableRow) => isDoneRow(row) || isFailedRow(row)

const getRowId = (row: TableRow): number | null => {
  const v = Number(row['Id'] ?? row['id'])
  return Number.isNaN(v) ? null : v
}

const deletableRows = computed(() => filteredRows.value.filter(isDeletableRow))

const allDeletableSelected = computed(() =>
  deletableRows.value.length > 0 &&
  deletableRows.value.every((r) => {
    const id = getRowId(r)
    return id !== null && selectedIds.value.has(id)
  }),
)

const toggleSelectAll = () => {
  const next = new Set(selectedIds.value)
  if (allDeletableSelected.value)
    deletableRows.value.forEach((r) => { const id = getRowId(r); if (id !== null) next.delete(id) })
  else
    deletableRows.value.forEach((r) => { const id = getRowId(r); if (id !== null) next.add(id) })
  selectedIds.value = next
}

const toggleRow = (row: TableRow) => {
  const id = getRowId(row)
  if (id === null) return
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = next
}

const openLastError = (row: TableRow) => {
  const error = toDisplayString(row['LastError']).trim()
  if (!error) return
  selectedErrorMessage.value = error
  errorDialogOpen.value = true
}

const deleteSelected = async () => {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  await fetch(`${apiBaseUrl}/api/jobs/job-queue`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  selectedIds.value = new Set()
  await fetchJobQueue(true)
}

const detailsTarget = (row: TableRow): 'gcode' | 'stl-panneau' | 'panneaux' | 'pieces' | null => {
  if (!isDoneRow(row)) return null
  const step = getStepName(row)
  if (step === 'createpieces') return 'pieces'
  if (step === 'nesting') return 'panneaux'
  if (step === 'computeinstructionmachine' || step === 'computeinstructionpanneaux') return 'gcode'
  if (step === 'generatestl') return 'stl-panneau'
  return null
}

const openStepDetails = (row: TableRow) => {
  const target = detailsTarget(row)
  if (!target) return
  const commandeId = getStringField(row, 'CommandeId')
  if (!commandeId) return
  if (target === 'pieces') {
    void router.push({ name: 'pieces', query: { commande: commandeId } })
    return
  }
  if (target === 'panneaux') {
    void router.push({ name: 'panneaux', query: { commande: commandeId } })
    return
  }
  void router.push({
    name: 'donnees',
    query: { from: 'chronos', commande: commandeId, tab: target },
  })
}

const getRowStatusClass = (row: TableRow) => {
  const status = getStringField(row, 'Status').toLowerCase()
  if (status === 'failed' || status === 'error' || status === 'erreur') return 'status-failed-row'
  if (status === 'done' || status === 'completed' || status === 'termine') return 'status-done-row'
  if (status === 'running') return 'status-running-row'
  if (status === 'enqueued' || status === 'pending') return 'status-inprogress-row'
  return ''
}

const parseDateValue = (value: unknown) => parseUtcDate(value)

const isPlannedFuturePendingRow = (row: TableRow) => {
  const commandeId = row['CommandeId'] ?? row['commandeId']
  if (commandeId === null || commandeId === undefined) return false
  const runMode = getStringField(row, 'RunMode').toLowerCase()
  const status = getStringField(row, 'Status').toLowerCase()
  const scheduledForRaw = row['ScheduledFor'] ?? row['scheduledFor']
  const scheduledFor = parseDateValue(scheduledForRaw)
  if (!scheduledFor) return false
  return runMode === 'planned' && status === 'pending' && scheduledFor.getTime() > Date.now()
}

const toDateInput = (date: Date) => {
  const y = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const toTimeInput = (date: Date) => {
  const h = String(date.getHours()).padStart(2, '0')
  const m = String(date.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const openScheduleDialog = (row: TableRow) => {
  const idRaw = row['Id'] ?? row['id']
  const id = Number(idRaw)
  const scheduledForRaw = row['ScheduledFor'] ?? row['scheduledFor']
  const scheduledFor = parseDateValue(scheduledForRaw)
  if (Number.isNaN(id) || !scheduledFor) return

  selectedQueueId.value = id
  plannedDate.value = toDateInput(scheduledFor)
  plannedTime.value = toTimeInput(scheduledFor)
  scheduleDialogError.value = ''
  scheduleDialogOpen.value = true
}

const closeScheduleDialog = () => {
  scheduleDialogOpen.value = false
  scheduleDialogError.value = ''
  scheduleDialogSaving.value = false
  selectedQueueId.value = null
}

const buildLocalScheduledFor = (dateValue: string, timeValue: string) => {
  const [yearRaw, monthRaw, dayRaw] = dateValue.split('-')
  const [hourRaw, minuteRaw] = timeValue.split(':')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  if ([year, month, day, hour, minute].some(Number.isNaN)) return null
  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (Number.isNaN(date.getTime())) return null
  if (date.getTime() <= Date.now()) return null
  const y = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}:00`
}

const saveSchedule = async () => {
  if (!selectedQueueId.value || scheduleDialogSaving.value) return
  const scheduledFor = buildLocalScheduledFor(plannedDate.value, plannedTime.value)
  if (!scheduledFor) {
    scheduleDialogError.value = 'La date/heure doit etre valide et dans le futur.'
    return
  }

  scheduleDialogSaving.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/jobs/job-queue/${selectedQueueId.value}/schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledFor }),
    })
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Statut HTTP ${response.status}`)
    }

    closeScheduleDialog()
    await fetchJobQueue(true)
  } catch (error) {
    scheduleDialogError.value = error instanceof Error ? error.message : 'Erreur lors de la mise a jour.'
  } finally {
    scheduleDialogSaving.value = false
  }
}

const openErrorDialog = (row: TableRow) => {
  selectedErrorMessage.value = getRowError(row)
  errorDialogOpen.value = true
}

const closeErrorDialog = () => {
  errorDialogOpen.value = false
}

const copyErrorToClipboard = async () => {
  if (!selectedErrorMessage.value) return

  try {
    await navigator.clipboard.writeText(selectedErrorMessage.value)
    return
  } catch {
    const textArea = document.createElement('textarea')
    textArea.value = selectedErrorMessage.value
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
  }
}

const showTooltip = (event: MouseEvent, stepName: string, row: TableRow) => {
  const commandeId = getStringField(row, 'CommandeId') || null
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  tooltip.value = { stepName, commandeId, x: rect.left + window.scrollX, y: rect.bottom + window.scrollY + 4 }
}
const hideTooltip = () => { tooltip.value = null }

const fetchExecutables = async () => {
  try {
    const response = await fetch(`${apiBaseUrl}/api/jobs/executables`)
    if (response.ok) executableParams.value = await response.json() as ExecutableInfoMap
  } catch { /* non-critical */ }
}

const fetchJobQueue = async (silent = false) => {
  if (!silent) {
    isLoading.value = true
  }
  if (rows.value.length === 0) {
    loadError.value = ''
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/jobs/job-queue`)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `Statut HTTP ${response.status}`)
    }

    const payload = (await response.json()) as TablePayload
    tableData.value = payload
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des jobs'
  } finally {
    if (!silent) {
      isLoading.value = false
    }
  }
}

onMounted(() => {
  void fetchExecutables()
  void fetchJobQueue()
  pollHandle = window.setInterval(() => {
    if (!isLoading.value) {
      void fetchJobQueue(true)
    }
  }, 2000)
})

onUnmounted(() => {
  if (pollHandle !== undefined) {
    window.clearInterval(pollHandle)
  }
})
</script>

<template>
  <section class="taches data-page">
    <header class="page-header">
      <h1>Tâches</h1>
    </header>

    <div v-if="isLoading && rows.length === 0" class="data-state data-state-loading">
      Chargement des jobs...
    </div>
    <div v-else-if="loadError && rows.length === 0" class="data-state data-state-error">{{ loadError }}</div>

    <div v-else class="data-table-wrapper">
      <div v-if="selectedIds.size > 0" class="bulk-toolbar">
        <button type="button" class="error-button delete-button" @click="deleteSelected">
          Supprimer la sélection ({{ selectedIds.size }})
        </button>
      </div>
      <table class="data-table taches-table">
        <thead>
          <tr>
            <th scope="col" class="checkbox-column">
              <input type="checkbox" :checked="allDeletableSelected" @change="toggleSelectAll" />
            </th>
            <th v-for="column in columns" :key="column.name" scope="col" :class="getColumnClass(column.name)">
              <div class="column-title">{{ getColumnLabel(column.name) }}</div>
            </th>
            <th scope="col"><div class="column-title">Actions</div></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, index) in filteredRows"
            :key="`nq-${index}-${toDisplayString(row['Id'])}`"
            :class="getRowStatusClass(row)"
          >
            <td class="checkbox-column">
              <input
                v-if="isDeletableRow(row)"
                type="checkbox"
                :checked="selectedIds.has(getRowId(row) ?? -1)"
                @change="toggleRow(row)"
              />
            </td>
            <td
              v-for="column in columns"
              :key="column.name"
              :class="getColumnClass(column.name)"
            >
              <span v-if="isDateTimeColumn(column)" class="datetime-cell-value">
                {{ formatDateTimeForCell(row[column.name]) }}
              </span>
              <span
                v-else-if="column.name === 'StepName' && executableParams[toDisplayString(row[column.name])]"
                class="step-name-cell"
                @mouseenter="showTooltip($event, toDisplayString(row[column.name]), row)"
                @mouseleave="hideTooltip"
              >
                {{ toDisplayString(row[column.name]) }}
              </span>
              <span
                v-else-if="column.name === 'Priority'"
                class="priority-text"
                :class="`priority-${priorityLabel(Number(row['Priority'] ?? 1))}`"
              >{{ priorityLabel(Number(row['Priority'] ?? 1)) }}</span>
              <span v-else-if="column.name === 'Status'">{{ formatStatus(row[column.name]) }}</span>
              <span
                v-else
                :class="{ 'error-cell-value': isErrorColumn(column.name) }"
                :title="isErrorColumn(column.name) ? toDisplayString(row[column.name]) : ''"
              >
                {{ toDisplayString(row[column.name]) }}
              </span>
            </td>
            <td>
              <button
                v-if="detailsTarget(row)"
                type="button"
                class="error-button"
                @click="openStepDetails(row)"
              >
                Détails
              </button>
              <button
                v-if="isFailedRow(row) && toDisplayString(row['LastError']).trim()"
                type="button"
                class="error-button"
                @click="openLastError(row)"
              >
                Voir erreur
              </button>
              <button
                v-if="isPlannedFuturePendingRow(row)"
                type="button"
                class="error-button"
                @click="openScheduleDialog(row)"
              >
                Modifier date/heure
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="tooltip"
      class="param-tooltip"
      :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
    >
      <div class="param-tooltip-header">
        <span class="param-tooltip-title">{{ tooltip.stepName }}</span>
        <span
          class="queue-badge"
          :class="`queue-${priorityLabel(executableParams[tooltip.stepName]?.priority ?? 1)}`"
        >{{ priorityLabel(executableParams[tooltip.stepName]?.priority ?? 1) }}</span>
      </div>
      <div
        v-for="p in executableParams[tooltip.stepName]?.parameters"
        :key="p.name"
        class="param-tooltip-row"
      >
        <span class="param-flag">{{ p.flag ?? `[${p.name}]` }}</span>
        <span v-if="p.isRequired && !p.defaultValue && tooltip.commandeId" class="param-commande-value">{{ tooltip.commandeId }}</span>
        <span v-else-if="p.isRequired && !p.defaultValue" class="param-badge required">requis</span>
        <span v-else-if="p.defaultValue" class="param-default">{{ p.defaultValue }}</span>
      </div>
    </div>

    <div v-if="errorDialogOpen" class="dialog-backdrop" @click.self="closeErrorDialog">
      <div class="dialog-panel">
        <h2>Erreur</h2>
        <pre class="dialog-message">{{ selectedErrorMessage }}</pre>
        <div class="dialog-actions">
          <button type="button" class="error-button" @click="copyErrorToClipboard">
            Copier
          </button>
          <button type="button" class="error-button close" @click="closeErrorDialog">
            Fermer
          </button>
        </div>
      </div>
    </div>

    <div v-if="scheduleDialogOpen" class="dialog-backdrop" @click.self="closeScheduleDialog">
      <div class="dialog-panel schedule-panel">
        <h2>Modifier date/heure planifiee</h2>
        <div class="schedule-fields">
          <label>
            Date
            <input v-model="plannedDate" type="date" :disabled="scheduleDialogSaving" />
          </label>
          <label>
            Heure
            <input v-model="plannedTime" type="time" :disabled="scheduleDialogSaving" />
          </label>
        </div>
        <p v-if="scheduleDialogError" class="schedule-error">{{ scheduleDialogError }}</p>
        <div class="dialog-actions">
          <button type="button" class="error-button close" @click="closeScheduleDialog" :disabled="scheduleDialogSaving">
            Annuler
          </button>
          <button type="button" class="error-button" @click="saveSchedule" :disabled="scheduleDialogSaving">
            {{ scheduleDialogSaving ? 'Enregistrement...' : 'Enregistrer' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.column-title {
  font-weight: 600;
  font-size: 0.84rem;
  line-height: 1.2;
  white-space: nowrap;
}

.error-cell-value {
  display: block;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.error-cell {
  max-width: 280px;
  word-break: normal !important;
}

.id-column {
  width: 60px;
  min-width: 60px;
  max-width: 60px;
}

.commande-column {
  width: 105px;
  min-width: 105px;
  max-width: 105px;
}

.runmode-column {
  width: 110px;
  min-width: 110px;
  max-width: 110px;
}

.status-column {
  width: 110px;
  min-width: 110px;
  max-width: 110px;
}

.attempts-column {
  white-space: nowrap;
}

.datetime-cell-value {
  display: inline-block;
  white-space: nowrap;
  line-height: 1.3;
  font-size: 0.9rem;
  letter-spacing: normal;
}

.datetime-column {
  min-width: 176px;
}

.step-column {
  min-width: 140px;
}

.queue-column {
  width: 90px;
  min-width: 90px;
  max-width: 90px;
  text-align: center;
}

.taches-table :deep(th),
.taches-table :deep(td) {
  word-break: normal;
  overflow-wrap: normal;
}

.taches-table :deep(tr) {
  transition: background-color 0.15s ease, border-left-color 0.15s ease;
  border-left: 4px solid transparent;
}

.taches-table :deep(tbody tr:hover) {
  background-color: #eef2f7;
}

.taches-table :deep(tr.status-failed-row) {
  background-color: #f8d7da;
  border-left-color: #b91c1c;
}

.taches-table :deep(tr.status-done-row) {
  background-color: #d1fae5;
  border-left-color: #15803d;
}

.taches-table :deep(tr.status-running-row) {
  background-color: #dbeafe;
  border-left-color: #1d4ed8;
}

.taches-table :deep(tr.status-inprogress-row) {
  background-color: #fef3c7;
  border-left-color: #b45309;
}

.taches-table :deep(tr.status-failed-row td),
.taches-table :deep(tr.status-done-row td),
.taches-table :deep(tr.status-running-row td),
.taches-table :deep(tr.status-inprogress-row td) {
  background-color: inherit;
}

.error-button {
  padding: 0.35rem 0.6rem;
  border: 1px solid #d4d4d9;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  font-size: 0.82rem;
}

.error-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error-button.close {
  background: #f3f4f6;
}

.error-button.delete-button {
  border-color: #fca5a5;
  color: #b91c1c;
}

.bulk-toolbar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.checkbox-column {
  width: 36px;
  min-width: 36px;
  max-width: 36px;
  text-align: center;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 45%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.dialog-panel {
  width: min(900px, 92vw);
  max-height: 80vh;
  background: #fff;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.schedule-panel {
  max-width: 460px;
}

.schedule-fields {
  display: flex;
  gap: 0.8rem;
  margin-top: 0.8rem;
}

.schedule-fields label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.92rem;
}

.schedule-fields input {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0.4rem 0.5rem;
}

.schedule-error {
  margin-top: 0.7rem;
  color: #b91c1c;
  font-size: 0.9rem;
}

.dialog-panel h2 {
  margin: 0;
  font-size: 1rem;
}

.dialog-message {
  margin: 0;
  padding: 0.75rem;
  border: 1px solid #e4e4e7;
  border-radius: 8px;
  background: #fafafa;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.86rem;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.taches-table {
  table-layout: auto;
  width: auto;
}

.step-name-cell {
  cursor: default;
  text-decoration: underline dotted #94a3b8;
}

.param-tooltip {
  position: absolute;
  z-index: 4000;
  background: #1e293b;
  color: #f1f5f9;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
  font-size: 0.82rem;
  box-shadow: 0 4px 16px rgb(0 0 0 / 25%);
  pointer-events: none;
  min-width: 180px;
}

.param-tooltip-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.param-tooltip-title {
  font-weight: 600;
  color: #93c5fd;
}

.param-tooltip-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0;
}

.param-flag {
  font-family: monospace;
  font-size: 0.8rem;
}

.param-badge {
  font-size: 0.7rem;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  font-weight: 600;
}

.param-badge.required {
  background: #7c3aed;
  color: #fff;
}

.param-default {
  color: #94a3b8;
  font-size: 0.78rem;
}

.priority-text {
  font-weight: 600;
  font-size: 0.82rem;
}

.priority-critique {
  color: #ea0404;
}

.priority-normal {
  color: #334155;
}

.priority-faible {
  color: #706c78;
}

.queue-badge {
  font-size: 0.68rem;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.queue-critique {
  background: #ea0404;
  color: #fff;
}

.queue-normal {
  background: #334155;
  color: #cbd5e1;
}

.queue-faible {
  background: #706c78;
  color: #e7e5e4;
}
</style>
