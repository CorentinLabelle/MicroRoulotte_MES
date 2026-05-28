<template>
  <section class="registres data-page">
    <header class="page-header">
      <h1>Jumeau numérique</h1>
    </header>

    <div class="data-table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th scope="col">Local</th>
            <th scope="col">ÉquipementId</th>
            <th scope="col">Nom</th>
            <th scope="col">TypeId</th>
            <th scope="col">Valeur</th>
            <th scope="col">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in equipmentRecords" :key="record.id" tabindex="0" class="copyable-row"
            :title="`Copier la ligne : ${record.equipmentId}`" @keydown="onRecordKeydown($event, record)">
            <td class="local-cell">{{ record.local }}</td>
            <td class="code-cell">{{ record.equipmentId }}</td>
            <td>{{ record.metricName }}</td>
            <td class="code-cell">{{ record.typeId }}</td>
            <td class="value-cell">{{ record.value }}</td>
            <td>{{ formatTimestamp(record.timestamp) }}</td>
          </tr>
          <tr v-if="equipmentRecords.length === 0" class="empty-row">
            <td colspan="6" class="data-table-empty">Aucune donnée d'équipement disponible.</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useClipboard } from '@/composables/useClipboard'

type EquipmentRecord = {
  id: string
  local: string
  equipmentId: string
  metricName: string
  typeId: string
  value: string
  timestamp: string
}

const equipmentRecords = ref<EquipmentRecord[]>([])

const formatTimestamp = (isoDate: string) => {
  if (!isoDate) {
    return ''
  }

  const date = new Date(isoDate)

  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return date.toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const { handleCopyKeydown } = useClipboard()

const buildRecordCopy = (record: EquipmentRecord) =>
  [
    `Local: ${record.local}`,
    `ÉquipementId: ${record.equipmentId}`,
    `Nom: ${record.metricName}`,
    `TypeId: ${record.typeId}`,
    `Valeur: ${record.value}`,
    `Timestamp: ${formatTimestamp(record.timestamp)}`,
  ].join('\t')

const onRecordKeydown = (event: KeyboardEvent, record: EquipmentRecord) => {
  void handleCopyKeydown(event, () => buildRecordCopy(record))
}
</script>

<style scoped>
.page-header h1 {
  margin-bottom: 0.25rem;
}

.page-header p {
  margin: 0 0 1.5rem;
  color: #5a5a5f;
}

.local-cell {
  font-weight: 600;
  color: #1f2a68;
}

.value-cell {
  font-variant-numeric: tabular-nums;
}
</style>
