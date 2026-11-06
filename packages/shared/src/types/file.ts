export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
  permissions?: string
}

export interface FileListResult {
  path: string
  entries: FileEntry[]
}
