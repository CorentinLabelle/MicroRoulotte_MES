type CsvCell = string | number | boolean | null | undefined

const escapeCell = (value: CsvCell): string => {
  if (value === null || value === undefined) {
    return ''
  }

  const stringValue = String(value)
  const needsEscaping = /[",;\r\n]/.test(stringValue)
  if (!needsEscaping) {
    return stringValue
  }

  const escapedValue = stringValue.replace(/"/g, '""')
  return `"${escapedValue}"`
}

export const downloadCsv = (filename: string, headers: string[], rows: CsvCell[][]) => {
  const headerRow = headers.map(escapeCell).join(';')
  const dataRows = rows.map((row) => row.map(escapeCell).join(';'))
  const csvContent = [headerRow, ...dataRows].join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.href = url
  link.setAttribute('download', filename)
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

