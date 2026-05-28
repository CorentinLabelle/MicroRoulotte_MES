<template>
  <section class="instructions data-page">
    <header class="page-header">
      <h1>{{ breadcrumbTitle }}</h1>
    </header>   

    <div v-if="loadError" class="data-state data-state-error">{{ loadError }}</div>
    <div v-else-if="isLoading" class="data-state data-state-loading">Chargement des informations...</div>
    <template v-else>
      <div v-if="programs.length === 0" class="empty-detail" role="note">
        <p>Aucune piece selectionnee.</p>
      </div>
      <template v-else>
        <div class="selection-grid" role="group" aria-label="Selection de piece, panneau et commande">
          <label class="selection-field">
            <span class="selection-label">CommandeId</span>
            <select
              v-model="selectedCommandeId"
              aria-label="Selectionner une commande"
              @change="onCommandeChange"
            >
              <option value="">Toutes</option>
              <option
                v-for="commande in commandeOptions"
                :key="`cmd-${commande}`"
                :value="commande"
              >
                {{ commande }}
              </option>
            </select>
          </label>
          <label class="selection-field">
            <span class="selection-label">PanneauId</span>
            <select
              v-model="selectedPanelId"
              :disabled="panelOptions.length === 0"
              aria-label="Selectionner un panneau"
              @change="onPanelChange"
            >
              <option value="">Tous</option>
              <option
                v-for="panel in panelOptions"
                :key="`panel-${panel}`"
                :value="panel"
              >
                {{ panel }}
              </option>
            </select>
          </label>
          <label class="selection-field">
            <span class="selection-label">PieceId</span>
            <select
              :key="pieceFiltersKey"
              v-model="selectedPieceId"
              :disabled="pieceIdOptions.length === 0"
              aria-label="Selectionner une piece"
              @change="onPieceChange"
            >
              <option value="">Toutes</option>
              <option
                v-for="piece in pieceIdOptions"
                :key="`piece-${piece}`"
                :value="piece"
              >
                {{ piece }}
              </option>
            </select>
          </label>
          <label class="selection-field">
            <span class="selection-label">Nom de piece</span>
            <select
              :key="`name-${pieceFiltersKey}`"
              v-model="selectedPieceId"
              :disabled="pieceNameOptions.length === 0"
              aria-label="Selectionner un nom de piece"
              @change="onPieceChange"
            >
              <option value="">Tous</option>
              <option
                v-for="option in pieceNameOptions"
                :key="`piece-name-${option.value}`"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <template v-if="currentProgram">
          <div class="tab-switcher" role="tablist" aria-label="Type d'instructions">
            <button
              v-for="tab in visibleTabs"
              :key="tab"
              type="button"
              class="tab-button"
              :class="{ active: tab === activeTab }"
              role="tab"
              :aria-selected="tab === activeTab"
              @click="activeTab = tab"
            >
              {{ getTabLabel(tab) }}
            </button>
          </div>
          <article class="detail-panel" role="tabpanel">
            <header class="detail-heading">
              <div>
                <h2>
                  <template v-if="selectedPieceId">
                    {{ currentProgram.pieceName }}
                  </template>
                  <template v-else>
                    Panneau {{ currentProgram.panelId }}
                  </template>
                </h2>
                <p v-if="selectedPieceId">
                  {{ currentProgram.operation }} - {{ displayMachine }}
                </p>
                <p v-else>
                  Selectionnez une piece pour afficher les details.
                </p>
              </div>
            </header>
            <section v-if="activeTab === 'svg'" class="detail-body">
              <SvgViewer
                :piece-id="currentProgram.pieceId"
                :panel-id="currentProgram.panelId"
                @download="downloadSvg"
              />
            </section>

            <section v-else-if="activeTab === 'stl-panneau'" class="detail-body">
              <div class="action-bar">
                <button type="button" class="detail-action" @click="downloadStlPanneau(currentProgram)">
                  Telecharger STL Panneau
                </button>
              </div>
              <StlViewer :panel-id="currentProgram.panelId" :auto-rotate="true" :key="currentProgram.panelId" />
            </section>

            <section v-else-if="activeTab === 'stl-piece'" class="detail-body">
              <div class="action-bar">
                <button type="button" class="detail-action" @click="downloadStlPiece(currentProgram)">
                  Telecharger STL Piece
                </button>
              </div>
              <StlViewer
                :piece-id="currentProgram.pieceId"
                :panel-id="currentProgram.panelId"
                :auto-rotate="true"
                :key="`piece-${currentProgram.pieceId}`"
              />
            </section>

            <section v-else-if="activeTab === 'stl-piece-roulotte'" class="detail-body">
              <div class="info-card">
                
              </div>
            </section>

            <section v-else-if="activeTab === 'gcode'" class="detail-body">
              <div class="action-bar">
                <button type="button" class="detail-action" @click="copyGCode()">
                  Copier le {{ isGcodeProgram ? 'G-code' : 'programme' }}
                </button>
                <a
                  v-if="isGcodeProgram"
                  href="https://ncviewer.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="detail-action"
                  role="button"
                >
                  Ouvrir NCViewer
                </a>
                <button type="button" class="detail-action" @click="downloadProgramFile()">
                  Telecharger
                </button>
              </div>
              <div v-if="!isGcodeProgram" class="info-note" role="note">
                Programme KRL pour {{ displayMachine }}.
              </div>
              <pre
                class="code-viewer"
                :aria-label="isGcodeProgram ? 'G-code' : 'Programme KRL'"
                tabindex="0"
              >{{ currentGcode }}</pre>
            </section>

            <section v-else class="detail-body">
              <div class="action-bar">
                <button type="button" class="detail-action" @click="downloadPseudo()">
                  Telecharger Pseudo-code
                </button>
              </div>
              <pre class="code-viewer" aria-label="Pseudo-code" tabindex="0">{{ pseudoCode }}</pre>
            </section>
          </article>
        </template>
        <div v-else class="empty-detail" role="note">
          <p>Selectionnez un panneau ou une piece pour afficher les details.</p>
        </div>   
      </template>   
    </template>   
  </section>   
</template>

<script setup lang="ts">
import SvgViewer from '@/components/SvgViewer.vue'
import StlViewer from '@/components/StlViewer.vue'
import { useInstructionsView } from './instructions/InstructionsView'

const {
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
} = useInstructionsView()
</script>
<style src="./instructions/InstructionsView.css" scoped></style>
