export type TableColumn = {
  name: string
  dataType: string
  isNullable: boolean
}

export type TableRow = Record<string, unknown>

export type TablePayload = {
  columns: TableColumn[]
  rows: TableRow[]
}
