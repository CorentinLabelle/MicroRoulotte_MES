<template>
  <section class="stl data-page">
    <header class="page-header">
      <h1>STL</h1>
    </header>

    <div class="tab-switcher" role="tablist" aria-label="Vues STL">
      <button
        v-for="tabKey in tabOrder"
        :key="tabKey"
        type="button"
        class="tab-button"
        :class="{ active: tabKey === activeTab }"
        role="tab"
        :aria-selected="tabKey === activeTab"
        @click="activeTab = tabKey"
      >
        {{ tabLabels[tabKey] }}
      </button>
    </div>

    <div class="tab-panel" role="tabpanel">
      <div class="data-table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th v-for="column in activeColumns" :key="column" scope="col">
                {{ columnLabels[column] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in activeRows"
              :key="row.id"
              tabindex="0"
              class="copyable-row"
              :class="{ 'is-highlighted': isHighlightedRow(row) }"
              :title="`Copier la ligne : ${row.reference}`"
              @keydown="onRowKeydown($event, row, activeColumns)"
            >
              <td v-for="column in activeColumns" :key="column" :class="cellClass(column)">
                {{ row[column] }}
              </td>
            </tr>
            <tr v-if="activeRows.length === 0" class="empty-row">
              <td :colspan="activeColumns.length" class="data-table-empty">
                Aucun enregistrement pour cette vue.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useClipboard } from '@/composables/useClipboard'

type TabKey = 'sur-panneau' | 'decoupees' | 'sur-roulotte'

type StlRow = {
  id: string
  reference: string
  panneau: string
  piece: string
  statut: string
  derniereOperation: string
  derniereMiseAJour: string
}

const tabLabels: Record<TabKey, string> = {
  'sur-panneau': 'Pièces sur panneau',
  decoupees: 'Pièces découpées',
  'sur-roulotte': 'Pièces sur roulotte',
}

const columnLabels: Record<keyof StlRow, string> = {
  id: 'Identifiant',
  reference: 'Référence',
  panneau: 'Panneau',
  piece: 'Pièce',
  statut: 'Statut',
  derniereOperation: 'Dernière opération',
  derniereMiseAJour: 'Dernière mise à jour',
}

const columnsByTab: Record<TabKey, Array<keyof StlRow>> = {
  'sur-panneau': ['panneau', 'piece', 'statut', 'derniereOperation', 'derniereMiseAJour'],
  decoupees: ['reference', 'panneau', 'piece', 'statut', 'derniereOperation', 'derniereMiseAJour'],
  'sur-roulotte': ['reference', 'panneau', 'piece', 'statut', 'derniereOperation', 'derniereMiseAJour'],
}

const rowsByTab = reactive<Record<TabKey, StlRow[]>>({
  'sur-panneau': [],
  decoupees: [],
  'sur-roulotte': [],
})

const tabOrder: TabKey[] = ['sur-panneau', 'decoupees', 'sur-roulotte']
const activeTab = ref<TabKey>('sur-panneau')

const { handleCopyKeydown } = useClipboard()
const route = useRoute()

const panelFilter = ref<string | null>(null)

const matchesRow = (row: StlRow, filter: string) => {
  const lower = filter.toLowerCase()

  return [row.panneau, row.reference, row.piece]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .some((value) => value === lower)
}

const findMatchingTab = (filter: string): TabKey | undefined =>
  tabOrder.find((tab) => rowsByTab[tab].some((row) => matchesRow(row, filter)))

const applyRouteFocus = () => {
  const { panelId, pieceId } = route.query
  const candidate =
    (typeof panelId === 'string' && panelId) || (typeof pieceId === 'string' && pieceId) || null

  if (candidate) {
    panelFilter.value = candidate
    const matchingTab = findMatchingTab(candidate)
    if (matchingTab) {
      activeTab.value = matchingTab
    }
  } else {
    panelFilter.value = null
  }
}

watch(
  () => route.query,
  () => {
    applyRouteFocus()
  }
)

watch(
  () => [rowsByTab['sur-panneau'].length, rowsByTab.decoupees.length, rowsByTab['sur-roulotte'].length],
  () => {
    if (panelFilter.value) {
      applyRouteFocus()
    }
  }
)

const activeColumns = computed(() => columnsByTab[activeTab.value])

const activeRows = computed(() => {
  const rows = rowsByTab[activeTab.value]

  if (!panelFilter.value) {
    return rows
  }

  const filtered = rows.filter((row) => matchesRow(row, panelFilter.value as string))
  return filtered.length > 0 ? filtered : rows
})

const cellClass = (key: string) =>
  key.toLowerCase().includes('ref') || key.toLowerCase().includes('panneau') ? 'code-cell' : ''

const isHighlightedRow = (row: StlRow) => {
  if (!panelFilter.value) {
    return false
  }

  return matchesRow(row, panelFilter.value)
}

const onRowKeydown = (
  event: KeyboardEvent,
  row: StlRow,
  columns: Array<keyof StlRow>
) => {
  void handleCopyKeydown(event, () =>
    columns.map((column) => `${columnLabels[column]}: ${row[column] ?? ''}`).join('\t')
  )
}
</script>

<style scoped>
.stl {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.page-header p {
  margin: 0;
  color: #5a5a5f;
}

.tab-switcher {
  display: inline-flex;
  align-self: flex-start;
  background: #1a1d24;
  border-radius: 12px;
  padding: 0.25rem;
  gap: 0.25rem;
}

.tab-button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #d0d3dc;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.tab-button:hover {
  background: #2f343c;
  color: #ffffff;
}

.tab-button.active {
  background: #3a3f47;
  color: #ffffff;
}

.tab-panel {
  background: #1a1d24;
  border-radius: 16px;
  padding: 1.5rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  color: #ffffff;
}

.tab-panel .data-table-wrapper {
  background: transparent;
  padding: 0;
  max-height: unset;
}

.tab-panel thead th {
  background: transparent;
  color: #d0d3dc;
}

.tab-panel tbody td {
  border-top-color: rgba(255, 255, 255, 0.08);
  color: #f7f7f7;
}

.is-highlighted td {
  background: rgba(125, 140, 255, 0.18);
  box-shadow: inset 0 0 0 1px rgba(125, 140, 255, 0.55);
}
</style>
