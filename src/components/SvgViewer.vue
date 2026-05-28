<template>
  <div class="svg-viewer">
    <div v-if="isLoading" class="state state-loading">
      <div class="spinner"></div>
      <p>Chargement du SVG...</p>
    </div>

    <div v-else-if="error" class="state state-error">
      <div class="icon">!</div>
      <p>{{ error }}</p>
      <button type="button" class="retry" @click="retry">Reessayer</button>
    </div>

    <div v-else-if="svgContent" class="viewer-panel">
      <div class="controls">
        <button type="button" class="control" :disabled="zoomLevel >= maxZoom" @click="zoomIn" aria-label="Zoom avant">+</button>
        <button type="button" class="control" :disabled="zoomLevel <= minZoom" @click="zoomOut" aria-label="Zoom arriere">-</button>
        <button type="button" class="control" @click="resetZoom" aria-label="Reinitialiser">1:1</button>
        <button type="button" class="download" @click="downloadSvg" aria-label="Telecharger">Télécharger</button>
        <span class="zoom">{{ Math.round(zoomLevel * 100) }}%</span>
      </div>

      <div class="canvas" ref="svgWrapper">
        <div class="canvas-inner" :style="{ transform: `scale(${zoomLevel})` }" v-html="svgContent"></div>
      </div>
    </div>

    <div v-else class="state state-empty">
      <div class="icon">0</div>
      <p>Aucun SVG disponible pour cette piece.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'

type ViewerProps = {
  pieceId: string
  panelId?: string
  svgUrl?: string
}

const props = defineProps<ViewerProps>()

const emit = defineEmits<{ download: [pieceId: string, panelId?: string] }>()

const svgContent = ref('')
const isLoading = ref(false)
const error = ref('')
const zoomLevel = ref(1)
const svgWrapper = ref<HTMLElement | null>(null)

const minZoom = 0.1
const maxZoom = 5

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'

function normalizeSvg(raw: string): string {
  return raw.replace(/<\?xml[^>]*\?>/i, '').trim()
}

async function loadSvg() {
  if (!props.pieceId) {
    return
  }

  isLoading.value = true
  error.value = ''

  try {
    if (props.svgUrl) {
      const response = await fetch(props.svgUrl)
      if (!response.ok) {
        throw new Error(`Erreur ${response.status}`)
      }
      const raw = await response.text()
      svgContent.value = response.headers.get('content-type')?.includes('application/json')
        ? JSON.parse(raw)
        : normalizeSvg(raw)
      centerScroll()
      return
    }

    const response = await fetch(`${apiBaseUrl}/api/pieces/${props.pieceId}/svg`)
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Fichier SVG introuvable pour cette piece')
      }
      throw new Error(`Erreur ${response.status}`)
    }

    const raw = await response.text()
    svgContent.value = response.headers.get('content-type')?.includes('application/json')
      ? JSON.parse(raw)
      : normalizeSvg(raw)
    centerScroll()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Erreur inconnue lors du chargement du SVG'
    svgContent.value = ''
  } finally {
    isLoading.value = false
  }
}

function zoomIn() {
  if (zoomLevel.value < maxZoom) {
    zoomLevel.value = Math.min(zoomLevel.value * 1.2, maxZoom)
  }
}

function zoomOut() {
  if (zoomLevel.value > minZoom) {
    zoomLevel.value = Math.max(zoomLevel.value / 1.2, minZoom)
  }
}

function resetZoom() {
  zoomLevel.value = 1
  centerScroll()
}

function downloadSvg() {
  emit('download', props.pieceId, props.panelId)
}

function retry() {
  void loadSvg()
}

function handleWheelZoom(event: WheelEvent) {
  if (!event.ctrlKey) {
    return
  }
  event.preventDefault()
  const wrapper = svgWrapper.value
  const prevScrollLeft = wrapper ? wrapper.scrollLeft : 0
  const prevScrollTop = wrapper ? wrapper.scrollTop : 0
  const prevWidth = wrapper ? wrapper.scrollWidth : 0
  const prevHeight = wrapper ? wrapper.scrollHeight : 0
  if (event.deltaY < 0) {
    zoomIn()
  } else {
    zoomOut()
  }
  requestAnimationFrame(() => {
    if (!wrapper) return
    const dw = wrapper.scrollWidth - prevWidth
    const dh = wrapper.scrollHeight - prevHeight
    wrapper.scrollLeft = prevScrollLeft + dw / 2
    wrapper.scrollTop = prevScrollTop + dh / 2
  })
}

function centerScroll() {
  const wrapper = svgWrapper.value
  if (!wrapper) return
  requestAnimationFrame(() => {
    wrapper.scrollTop = (wrapper.scrollHeight - wrapper.clientHeight) / 2
    wrapper.scrollLeft = (wrapper.scrollWidth - wrapper.clientWidth) / 2
  })
}

watch(
  () => props.pieceId,
  () => {
    zoomLevel.value = 1
    void loadSvg()
  }
)

watch(
  () => props.svgUrl,
  () => {
    zoomLevel.value = 1
    void loadSvg()
  }
)

watch(zoomLevel, () => {
  centerScroll()
})

onMounted(() => {
  void loadSvg()
  document.addEventListener('wheel', handleWheelZoom, { passive: false })
})

onUnmounted(() => {
  document.removeEventListener('wheel', handleWheelZoom)
})
</script>

<style scoped>
.svg-viewer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #ffffff;
  color: #1f2933;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}

.state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  background: #ffffff;
  text-align: center;
  padding: 2rem;
}

.state-loading .spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #d0d6e1;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.state-error {
  color: #c0392b;
}

.state-empty {
  color: #6b7280;
}

.icon {
  font-size: 2.5rem;
}

.retry {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s ease;
}

.retry:hover {
  background: #1d4ed8;
}

.viewer-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f5f7fb;
  border-bottom: 1px solid #e2e8f0;
}
.download {
  width: 100px;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #1f2933;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.download:hover:not(:disabled) {
  background: #eef2ff;
  border-color: #c1c8ff;
}

.control {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 1px solid #d4d4d9;
  border-radius: 8px;
  color: #1f2933;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.control:hover:not(:disabled) {
  background: #eef2ff;
  border-color: #c1c8ff;
}

.control:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom {
  margin-left: auto;
  font-size: 0.9rem;
  font-weight: 600;
  color: #475569;
}

.canvas {
  flex: 1;
  min-height: 600px;
  overflow: auto;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
}

.canvas-inner {
  min-height: 580px;
  min-width: 580px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center center;
  transition: transform 0.2s ease;
  background: #ffffff;
}

:deep(svg) {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  background: #ffffff;
}

.canvas-inner :deep(path),
:deep(polyline),
:deep(line) {
  vector-effect: non-scaling-stroke;
  stroke-width: 1.5;
  stroke: #1f2933;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .controls {
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .control {
    width: 32px;
    height: 32px;
  }

  .canvas {
    padding: 0.75rem;
  }
}
</style>