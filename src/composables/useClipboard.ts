export const useClipboard = () => {
  const copyText = async (text: string) => {
    if (!text) {
      return
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch (error) {
        console.warn('Clipboard permission denied', error)
      }
    }

    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'absolute'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  const handleCopyKeydown = async (
    event: KeyboardEvent,
    textOrFactory: string | (() => string)
  ) => {
    if (!(event.ctrlKey || event.metaKey)) {
      return
    }

    if (event.key.toLowerCase() !== 'c') {
      return
    }

    event.preventDefault()

    const value = typeof textOrFactory === 'function' ? textOrFactory() : textOrFactory
    await copyText(value)
  }

  return { copyText, handleCopyKeydown }
}
