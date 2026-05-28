<template>
  <div class="stl-viewer" role="presentation">
    <div ref="canvasContainer" class="stl-canvas"></div>

    <div v-if="isLoading" class="overlay state-loading" aria-live="polite">
      <p>Chargement du STL...</p>
    </div>

    <div v-else-if="statusMessage" :class="['overlay', statusVariantClass]">
      <p>{{ statusMessage }}</p>
      <button
        v-if="statusVariant === 'error'"
        type="button"
        class="retry-button"
        @click="reload"
      >
        Reessayer
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { deserialize } from '@jscad/stl-deserializer'
import { prepareRender, drawCommands, cameras, controls, entitiesFromSolids } from '@jscad/regl-renderer'

type ViewerStatus = 'idle' | 'ready' | 'empty' | 'error'

type Props = {
  panelId?: string | number
  pieceId?: string | number
  stlUrl?: string
  autoRotate?: boolean
}

const props = defineProps<Props>()

const canvasContainer = ref<HTMLDivElement | null>(null)
const isLoading = ref(false)
const status = ref<ViewerStatus>('idle')
const statusMessage = ref('')

const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://localhost:5001'

const normalizedPieceId = computed(() => {
  if (props.pieceId === undefined || props.pieceId === null) {
    return null
  }
  const value = String(props.pieceId).trim()
  return /^\d+$/.test(value) ? value : null
})

const normalizedPanelId = computed(() => {
  if (props.panelId === undefined || props.panelId === null) {
    return null
  }
  const value = String(props.panelId).trim()
  return /^\d+$/.test(value) ? value : null
})

const resolvedUrl = computed(() => {
  if (props.stlUrl) {
    return props.stlUrl
  }
  if (normalizedPieceId.value) {
    return `${apiBaseUrl}/api/pieces/${normalizedPieceId.value}/stl`
  }
  if (normalizedPanelId.value) {
    return `${apiBaseUrl}/api/panneaux/${normalizedPanelId.value}/stl`
  }
  return null
})

const statusVariant = computed(() => {
  if (status.value === 'error') {
    return 'error'
  }
  if (status.value === 'empty') {
    return 'empty'
  }
  return ''
})

const statusVariantClass = computed(() => {
  if (!statusVariant.value) {
    return 'state-ready'
  }
  return statusVariant.value === 'error' ? 'state-error' : 'state-empty'
})

const targetLabel = computed(() => {
  if (normalizedPieceId.value) {
    return `la piece ${normalizedPieceId.value}`
  }
  if (normalizedPanelId.value) {
    return `le panneau ${normalizedPanelId.value}`
  }
  return "l'element selectionne"
})

let renderer: ((options: any) => void) | null = null
let resizeObserver: ResizeObserver | null = null
let stateCamera: any = null
let stateControls: any = null
let renderOptions: any = null
let stopUrlWatcher: (() => void) | null = null
let renderScheduled = false

const perspectiveCamera = cameras.perspective
const orbitControls = controls.orbit

const drawCommandSet = {
  drawAxis: drawCommands.drawAxis,
  drawLines: drawCommands.drawLines,
  drawMesh: drawCommands.drawMesh,
}


const axisEntity = {
  visuals: {
    drawCmd: 'drawAxis',
    show: true,
  },
  size: 300,
}

const pointerState = {
  isActive: false,
  lastX: 0,
  lastY: 0,
  rotateDelta: [0, 0] as [number, number],
  panDelta: [0, 0] as [number, number],
  zoomDelta: 0,
}

const interactionSpeeds = {
  rotate: 0.002,
  pan: 1,
  zoom: 0.08,
}

let updateView = true

function cloneCamera(width: number, height: number) {
  const defaults = perspectiveCamera.defaults
  const camera = {
    ...defaults,
    view: Float32Array.from(defaults.view),
    projection: Float32Array.from(defaults.projection),
    matrix: Float32Array.from(defaults.matrix),
    eye: Float32Array.from(defaults.eye),
    position: [...defaults.position],
    target: [...defaults.target],
    up: [...defaults.up],
    viewport: [0, 0, width, height],
    aspect: width / height,
  }

  perspectiveCamera.setProjection(camera, camera, { width, height })
  perspectiveCamera.update(camera)
  return camera
}

function cloneControls() {
  const defaults = orbitControls.defaults
  return {
    ...defaults,
    limits: { ...defaults.limits },
    zoomToFit: { ...defaults.zoomToFit },
    userControl: { ...defaults.userControl },
  }
}

function ensureRenderer() {
  if (renderer || !canvasContainer.value) {
    return
  }

  const container = canvasContainer.value
  const width = Math.max(container.clientWidth, 200)
  const height = Math.max(container.clientHeight || width, 200)

  stateCamera = cloneCamera(width, height)
  stateControls = cloneControls()

  renderOptions = {
    glOptions: { container },
    camera: stateCamera,
    drawCommands: drawCommandSet,
  }

  renderer = prepareRender(renderOptions)
  if (renderer) {
    updateView = true
    requestRender()
  }
  attachInteraction()
}

function requestRender() {
  if (renderScheduled) {
    return
  }
  renderScheduled = true
  window.requestAnimationFrame(() => {
    renderScheduled = false
    renderScene()
  })
}

function renderScene() {
  if (!renderer || !renderOptions || !stateControls || !stateCamera) {
    return
  }

  if (!updateView) {
    return
  }

  applyPointerUpdates()

  const updates = orbitControls.update({ controls: stateControls, camera: stateCamera })
  stateControls = { ...stateControls, ...updates.controls }
  stateCamera = { ...stateCamera, ...updates.camera }
  perspectiveCamera.update(stateCamera)
  renderOptions.camera = stateCamera
  renderer?.(renderOptions)
  updateView = false
}

function applyPointerUpdates() {
  if (!stateControls) {
    return
  }

  const [rdx, rdy] = pointerState.rotateDelta
  const [pdx, pdy] = pointerState.panDelta
  const zoomDelta = pointerState.zoomDelta

  if ((rdx || rdy) && stateControls.userControl.rotate) {
    const updated = orbitControls.rotate({ controls: stateControls, camera: stateCamera, speed: interactionSpeeds.rotate }, [rdx, rdy])
    stateControls = { ...stateControls, ...updated.controls }
    pointerState.rotateDelta = [0, 0]
    updateView = true
  }

  if ((pdx || pdy) && stateControls.userControl.pan) {
    const updated = orbitControls.pan({ controls: stateControls, camera: stateCamera, speed: interactionSpeeds.pan }, [pdx, pdy])
    stateControls = { ...stateControls, ...updated.controls }
    stateCamera.position = updated.camera.position
    stateCamera.target = updated.camera.target
    pointerState.panDelta = [0, 0]
    updateView = true
  }

  if (zoomDelta && stateControls.userControl.zoom) {
    const updated = orbitControls.zoom({ controls: stateControls, camera: stateCamera, speed: interactionSpeeds.zoom }, zoomDelta)
    stateControls = { ...stateControls, ...updated.controls }
    pointerState.zoomDelta = 0
    updateView = true
  }
}

function attachInteraction() {
  if (!canvasContainer.value) {
    return
  }

  const element = canvasContainer.value

  const moveHandler = (event: PointerEvent) => {
    if (!pointerState.isActive) {
      return
    }
    const dx = pointerState.lastX - event.clientX
    const dy = event.clientY - pointerState.lastY
    const isPan = event.shiftKey || (event.pointerType === 'touch' && event.isPrimary === false)

    if (isPan) {
      pointerState.panDelta[0] += dx
      pointerState.panDelta[1] += dy
    } else {
      pointerState.rotateDelta[0] -= dx
      pointerState.rotateDelta[1] -= dy
    }

    pointerState.lastX = event.clientX
    pointerState.lastY = event.clientY
    updateView = true
    requestRender()
    event.preventDefault()
  }

  const downHandler = (event: PointerEvent) => {
    pointerState.isActive = true
    pointerState.lastX = event.clientX
    pointerState.lastY = event.clientY
    element.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  const upHandler = (event: PointerEvent) => {
    pointerState.isActive = false
    element.releasePointerCapture(event.pointerId)
    event.preventDefault()
  }

  const wheelHandler = (event: WheelEvent) => {
    pointerState.zoomDelta += event.deltaY
    updateView = true
    requestRender()
    event.preventDefault()
  }

  element.addEventListener('pointermove', moveHandler)
  element.addEventListener('pointerdown', downHandler)
  element.addEventListener('pointerup', upHandler)
  element.addEventListener('pointercancel', upHandler)
  element.addEventListener('pointerleave', upHandler)
  element.addEventListener('wheel', wheelHandler, { passive: false })

  cleanupCallbacks.push(() => {
    element.removeEventListener('pointermove', moveHandler)
    element.removeEventListener('pointerdown', downHandler)
    element.removeEventListener('pointerup', upHandler)
    element.removeEventListener('pointercancel', upHandler)
    element.removeEventListener('pointerleave', upHandler)
    element.removeEventListener('wheel', wheelHandler)
  })
}

const cleanupCallbacks: Array<() => void> = []

function setStatus(nextStatus: ViewerStatus, message = '') {
  status.value = nextStatus
  statusMessage.value = message
}

async function loadStl() {
  if (!resolvedUrl.value) {
    setStatus('empty', 'Selectionnez une piece ou un panneau pour afficher le STL.')
    return
  }

  ensureRenderer()
  if (!renderer || !renderOptions) {
    return
  }

  isLoading.value = true
  setStatus('idle')

  try {
    const response = await fetch(resolvedUrl.value)
    if (response.status === 404) {
      setStatus('empty', `Aucun fichier STL disponible pour ${targetLabel.value}.`)
      return
    }
    if (!response.ok) {
      throw new Error(`Requete HTTP ${response.status}`)
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0) {
      setStatus('empty', `Le fichier STL recu pour ${targetLabel.value} est vide.`)
      return
    }

    const solids = deserialize(
      {
        output: 'geometry',
        addMetaData: false,
        filename: normalizedPieceId.value
          ? `piece-${normalizedPieceId.value}.stl`
          : normalizedPanelId.value
            ? `panneau-${normalizedPanelId.value}.stl`
            : 'modele.stl',
      },
      buffer
    )

    const solidList = (Array.isArray(solids) ? solids : [solids]) as unknown[]
    if (solidList.length === 0) {
      setStatus('empty', `Impossible de generer le maillage STL pour ${targetLabel.value}.`)
      return
    }

    const stlEntities = entitiesFromSolids({ color: [0.62, 0.74, 0.94, 1] }, solidList as any)
    renderOptions.entities = [ axisEntity, ...stlEntities]

    const fit = orbitControls.zoomToFit({ controls: stateControls, camera: stateCamera, entities: stlEntities })
    stateControls = { ...stateControls, ...fit.controls }
    if (fit.camera?.position) {
      stateCamera.position = fit.camera.position
    }
    if (fit.camera?.target) {
      stateCamera.target = fit.camera.target
    }

    updateView = true
    requestRender()
    setStatus('ready')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue lors du chargement du STL.'
    setStatus('error', message)
  } finally {
    isLoading.value = false
  }
}

function handleResize(entries: ResizeObserverEntry[]) {
  if (!entries.length || !stateCamera) {
    return
  }
  const entry = entries[0]
  const width = Math.max(Math.floor(entry.contentRect.width), 200)
  const height = Math.max(Math.floor(entry.contentRect.height), 200)

  stateCamera.viewport = [0, 0, width, height]
  stateCamera.aspect = width / height
  perspectiveCamera.setProjection(stateCamera, stateCamera, { width, height })
  updateView = true
  requestRender()
}

function reload() {
  void loadStl()
}

onMounted(() => {
  ensureRenderer()

  resizeObserver = new ResizeObserver(handleResize)
  if (canvasContainer.value) {
    resizeObserver.observe(canvasContainer.value)
  }
  cleanupCallbacks.push(() => resizeObserver?.disconnect())

  stopUrlWatcher = watch(
    resolvedUrl,
    () => {
      void nextTick(() => {
        void loadStl()
      })
    },
    { immediate: true }
  )

  cleanupCallbacks.push(() => {
    if (stopUrlWatcher) {
      stopUrlWatcher()
      stopUrlWatcher = null
    }
  })

})

onBeforeUnmount(() => {
  cleanupCallbacks.forEach((dispose) => {
    try {
      dispose()
    } catch (error) {
      console.warn('STL viewer cleanup issue', error)
    }
  })
  cleanupCallbacks.length = 0

  if (canvasContainer.value) {
    canvasContainer.value.innerHTML = ''
  }
  renderer = null
  renderOptions = null
  stateCamera = null
  stateControls = null
})

watch(
  () => props.autoRotate,
  (enabled) => {
    if (!stateControls) {
      return
    }
    stateControls.autoRotate = { ...stateControls.autoRotate, enabled: Boolean(enabled) }
    updateView = true
    requestRender()
  }
)

</script>

<style scoped>
.stl-viewer {
  position: relative;
  width: 100%;
  min-height: 360px;
  border-radius: 12px;
  overflow: hidden;
  background: #0f1117;
  border: 1px solid #2f343c;
}

.stl-canvas {
  width: 100%;
  height: 100%;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1.5rem;
  text-align: center;
  background: rgba(15, 17, 23, 0.85);
  color: #f7f7f7;
  backdrop-filter: blur(2px);
}

.state-loading {
  background: rgba(15, 17, 23, 0.9);
}

.state-error {
  color: #ffb4b4;
}

.state-empty {
  color: #a7abba;
}

.state-ready {
  display: none;
}


.retry-button {
  border: 1px solid #ffffff44;
  border-radius: 8px;
  background: transparent;
  color: #ffffff;
  padding: 0.4rem 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.retry-button:hover {
  background: #ffffff;
  color: #0f1117;
  border-color: transparent;
}

</style> 
