<template>
  <section class="registre-donnees data-page">
    <header class="page-header">
      <h1>Registres de données</h1>
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
          @click="downloadRegistresCsv"
          :disabled="isLoading || filteredRegistres.length === 0"
        >
          Telecharger
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="data-state data-state-loading">Chargement des données...</div>
    <div v-else-if="loadError" class="data-state data-state-error">{{ loadError }}</div>

    <div v-else class="data-table-wrapper">
      <table class="filters-table">
        <tbody>
          <tr class="filters-row">
            <!-- Filtre Type -->
            <td class="type-cell">
              <select v-model="filters.type" aria-label="Filtrer par Type">
                <option value="">Tous</option>
                <option v-for="t in typeOptions" :key="`type-${t}`" :value="t">{{ t }}</option>
              </select>
            </td>
            <!-- Colonne Id (pas de filtre) -->
            <td class="id-cell"></td>
            <!-- Filtre Nom -->
            <td class="nom-cell">
              <input v-model.trim="filters.nom" type="text" placeholder="Nom contient..." aria-label="Filtrer par Nom" />
            </td>
            <!-- Filtre Valeur -->
            <td class="valeur-cell">
              <input v-model.trim="filters.valeur" type="text" placeholder="Valeur contient..." aria-label="Filtrer par Valeur" />
            </td>
          </tr>
        </tbody>
      </table>
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col" class="type-cell">Type</th>
            <th scope="col" class="id-cell">Id</th>
            <th scope="col" class="nom-cell">Nom</th>
            <th scope="col" class="valeur-cell">Valeur</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="registre in filteredRegistres"
            :key="registre.id"
            tabindex="0"
            class="copyable-row"
            :title="`Copier la ligne : ${registre.id}`"
            @keydown="onRegistreKeydown($event, registre)"
          >
            <td>{{ registre.type }}</td>
            <td class="cell-id"><span class="registre-id">{{ registre.id }}</span></td>
            <td>{{ registre.nom }}</td>
            <td>{{ formatValue(registre.valeur, registre.type) }}</td>
          </tr>
          <tr v-if="filteredRegistres.length === 0" class="empty-row">
            <td colspan="4" class="data-table-empty">Aucune donnée ne correspond aux filtres.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue'
import { useClipboard } from '@/composables/useClipboard'
import { downloadCsv } from '@/utils/csv'

type RegistreDonnee = {
  type: string
  id: number | string
  nom: string
  valeur: unknown
}

const registres = ref<RegistreDonnee[]>([])
const isLoading = ref(false)
const loadError = ref('')

const filters = reactive({
  type: '' as string,
  nom: '' as string,
  valeur: '' as string,
})

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'

const typeOptions = computed<string[]>(() => {
  const set = new Set<string>()
  for (const r of registres.value) set.add(r.type)
  return Array.from(set).sort((a,b)=>a.localeCompare(b))
})


const filteredRegistres = computed(() => {
  return registres.value.filter((r) => {
    if (filters.type) {
      if (r.type !== filters.type) return false
    }
    if (filters.nom) {
      if (!r.nom.toLowerCase().includes(filters.nom.toLowerCase())) return false
    }
    if (filters.valeur) {
      const valStr = String(r.valeur ?? '').toLowerCase()
      if (!valStr.includes(filters.valeur.toLowerCase())) return false
    }
    return true
  })
})

const { handleCopyKeydown } = useClipboard()

const buildRegistreCopy = (registre: RegistreDonnee) =>
  [
    `Id: ${registre.id}`,
    `Nom: ${registre.nom}`,
    `Valeur: ${formatValue(registre.valeur, registre.type)}`,
    `Type: ${registre.type}`,
  ].join('\t')

const onRegistreKeydown = (event: KeyboardEvent, registre: RegistreDonnee) => {
  void handleCopyKeydown(event, () => buildRegistreCopy(registre))
}

const downloadRegistresCsv = () => {
  const headers = ['Type', 'Id', 'Nom', 'Valeur']
  const rows = filteredRegistres.value.map((registre) => [
    registre.type,
    registre.id,
    registre.nom,
    formatValue(registre.valeur, registre.type),
  ])

  downloadCsv('registres.csv', headers, rows)
}

const formatValue = (value: unknown, type: string) => {
  if (value === null || value === undefined) {
    return '---'
  }

  switch (type.toLowerCase()) {
    case 'bit':
      return Boolean(value) ? '1' : '0'
    case 'int':
      return new Intl.NumberFormat('fr-CA').format(Number(value))
    case 'float':
      return new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 6 }).format(Number(value))
    default:
      return String(value)
  }
}

const typeClass = (_type: string) => 'type-default'

const fetchRegistres = async () => {
  isLoading.value = true
  loadError.value = ''

  try {
    // TODO: Remplacer par l'endpoint API réel
    const response = await fetch(`${apiBaseUrl}/api/registres`)

    if (!response.ok) {
      throw new Error(`RequÃªte API Ã©chouée (status ${response.status})`)
    }

    const data = (await response.json()) as RegistreDonnee[]
    registres.value = data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue lors du chargement des données'
    loadError.value = message
    registres.value = []
  } finally {
    isLoading.value = false
  }
}

const refresh = () => {
  if (!isLoading.value) {
    void fetchRegistres()
  }
}

const resetFilters = () => {
  filters.type = ''
  filters.nom = ''
  filters.valeur = ''
}

onMounted(() => {
  void fetchRegistres()
})
</script>

<style scoped>
.registre-donnees.data-page {
  overflow-x: hidden;
  max-width: 100%;
}

.page-header h1 {
  margin-bottom: 0.25rem;
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

.filters-row select,
.filters-row input {
  height: 36px;
  border-radius: 8px;
  border: 1px solid #d4d4d9;
  padding: 0 0.5rem;
  font-size: 0.9rem;
  display: block;
  margin: 0 auto;
}

/* Align filters table columns with data table */
.filters-table {
  width: 100%;
  border-collapse: separate;
}

.registre-donnees .data-table-wrapper {
  max-width: 100%;
  overflow-x: auto;
  overflow-y: auto;
  max-height: calc(100vh - 240px);
  padding-bottom: 1.25rem;
  box-sizing: border-box;
}


.filters-table .type-cell { width: 360px; }
.filters-table .nom-cell { width: 360px; }
.filters-table .valeur-cell { width: 350px; }

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

.cell-id {
  font-weight: 600;
}
</style>
