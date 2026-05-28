declare module '@jscad/stl-deserializer' {
  type DeserializeOptions = {
    filename?: string
    version?: string
    addMetaData?: boolean
    output?: 'script' | 'geometry'
  }

  export const deserialize: (
    options: DeserializeOptions,
    data: ArrayBuffer | Uint8Array | string
  ) => unknown
}

declare module '@jscad/regl-renderer' {
  export const prepareRender: any
  export const drawCommands: any
  export const cameras: any
  export const controls: any
  export const entitiesFromSolids: any
}
