<template>
  <div v-if="open" class="modal-backdrop">
    <div class="modal">
      <header class="modal__header">
        <h2>Confirmer le nesting</h2>
      </header>
      <section class="modal__body">
        <p class="modal__question">
          Lancer le nesting pour la commande
          <strong class="badge">{{ commandeId }}</strong> ?
        </p>
        <p class="modal__hint">
          Cette action démarre immédiatement le processus de nesting pour la commande sélectionnée.
        </p>
        <p v-if="error" class="modal__error">{{ error }}</p>
      </section>
      <footer class="modal__footer">
        <button
          type="button"
          class="modal__btn modal__btn--secondary"
          @click="$emit('cancel')"
          :disabled="loading"
        >
          Annuler
        </button>
        <button
          type="button"
          class="modal__btn modal__btn--primary"
          @click="$emit('confirm')"
          :disabled="loading"
        >
          {{ loading ? 'Démarrage...' : 'Démarrer le nesting' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean
  commandeId: string
  loading: boolean
  error: string
}>()

defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.28);
  display: grid;
  place-items: center;
  padding: 1rem;
  z-index: 20;
}

.modal {
  width: min(520px, 100%);
  background: #ffffff;
  color: #111827;
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.2);
  border: 1px solid #e5e7eb;
  overflow: hidden;
}

.modal__header {
  padding: 1.1rem 1.25rem 0.4rem;
  border-bottom: 1px solid #f3f4f6;
}

.modal__header h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #111827;
}

.modal__body {
  padding: 1rem 1.25rem 0.25rem;
  line-height: 1.5;
}

.modal__question {
  margin: 0 0 0.35rem;
  font-weight: 600;
  color: #111827;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: #0f9d58;
  color: #ffffff;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.modal__hint {
  margin-top: 0.4rem;
  font-size: 0.9rem;
  color: #4b5563;
}

.modal__error {
  margin-top: 0.75rem;
  padding: 0.65rem 0.75rem;
  background: #fff1f0;
  border: 1px solid #f8d7da;
  color: #b91c1c;
  border-radius: 10px;
  font-weight: 600;
}

.modal__footer {
  padding: 1rem 1.25rem 1.15rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.65rem;
}

.modal__btn {
  min-width: 160px;
  border: 1px solid #d1d5db;
  padding: 0.65rem 1rem;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.modal__btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.modal__btn--secondary {
  background: #ffffff;
  color: #111827;
}

.modal__btn--secondary:hover:not(:disabled) {
  background: #f3f4f6;
  border-color: #cbd5e1;
}

.modal__btn--primary {
  background: #0f9d58;
  color: #ffffff;
  border-color: #0c8048;
}

.modal__btn--primary:hover:not(:disabled) {
  background: #0c8048;
  border-color: #0b6d3e;
}
</style>
