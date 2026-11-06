import type { Socket } from 'socket.io-client'
import type {
  FileListPayload,
  FileListResultPayload,
  FileReadPayload,
  FileReadResultPayload,
  FileWritePayload,
  FileWriteResultPayload,
  FileDeletePayload,
  FileDeleteResultPayload,
  FileMkdirPayload,
  FileMkdirResultPayload,
} from '@termix/shared'

export const DEFAULT_FILE_TIMEOUT_MS = 15000

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
}

/**
 * Generic request correlation helper over Socket.IO with requestId and 15s timeout
 */
export function requestFileOperation<TReq, TRes extends { requestId: string; error?: string }>(
  socket: Socket,
  sendEvent: string,
  resultEvent: string,
  payload: Omit<TReq, 'requestId'>,
  timeoutMs: number = DEFAULT_FILE_TIMEOUT_MS
): Promise<TRes> {
  return new Promise<TRes>((resolve, reject) => {
    const requestId = generateRequestId()
    let timer: ReturnType<typeof setTimeout> | null = null

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      socket.off(resultEvent, onResult)
      socket.off('disconnect', onDisconnect)
    }

    const onResult = (data: TRes) => {
      if (data && data.requestId === requestId) {
        cleanup()
        if (data.error) {
          reject(new Error(data.error))
        } else {
          resolve(data)
        }
      }
    }

    const onDisconnect = () => {
      cleanup()
      reject(new Error('Socket disconnected while waiting for file operation'))
    }

    timer = setTimeout(() => {
      cleanup()
      reject(new Error(`File operation '${sendEvent}' timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    socket.on(resultEvent, onResult)
    socket.on('disconnect', onDisconnect)

    socket.emit(sendEvent, { ...payload, requestId })
  })
}

export function requestFileList(
  socket: Socket,
  deviceId: string,
  path: string = '',
  timeoutMs: number = DEFAULT_FILE_TIMEOUT_MS
): Promise<FileListResultPayload> {
  return requestFileOperation<FileListPayload, FileListResultPayload>(
    socket,
    'file:list',
    'file:list:result',
    { deviceId, path },
    timeoutMs
  )
}

export function requestFileRead(
  socket: Socket,
  deviceId: string,
  path: string,
  timeoutMs: number = DEFAULT_FILE_TIMEOUT_MS
): Promise<FileReadResultPayload> {
  return requestFileOperation<FileReadPayload, FileReadResultPayload>(
    socket,
    'file:read',
    'file:read:result',
    { deviceId, path },
    timeoutMs
  )
}

export function requestFileWrite(
  socket: Socket,
  deviceId: string,
  path: string,
  content: string,
  timeoutMs: number = DEFAULT_FILE_TIMEOUT_MS
): Promise<FileWriteResultPayload> {
  return requestFileOperation<FileWritePayload, FileWriteResultPayload>(
    socket,
    'file:write',
    'file:write:result',
    { deviceId, path, content },
    timeoutMs
  ).then((res) => {
    if (!res.success && res.error) {
      throw new Error(res.error)
    }
    return res
  })
}

export function requestFileDelete(
  socket: Socket,
  deviceId: string,
  path: string,
  timeoutMs: number = DEFAULT_FILE_TIMEOUT_MS
): Promise<FileDeleteResultPayload> {
  return requestFileOperation<FileDeletePayload, FileDeleteResultPayload>(
    socket,
    'file:delete',
    'file:delete:result',
    { deviceId, path },
    timeoutMs
  ).then((res) => {
    if (!res.success && res.error) {
      throw new Error(res.error)
    }
    return res
  })
}

export function requestFileMkdir(
  socket: Socket,
  deviceId: string,
  path: string,
  timeoutMs: number = DEFAULT_FILE_TIMEOUT_MS
): Promise<FileMkdirResultPayload> {
  return requestFileOperation<FileMkdirPayload, FileMkdirResultPayload>(
    socket,
    'file:mkdir',
    'file:mkdir:result',
    { deviceId, path },
    timeoutMs
  ).then((res) => {
    if (!res.success && res.error) {
      throw new Error(res.error)
    }
    return res
  })
}

export const fileClient = {
  listDirectory: requestFileList,
  readFile: async (socket: Socket, deviceId: string, path: string, timeoutMs?: number): Promise<string> => {
    const res = await requestFileRead(socket, deviceId, path, timeoutMs)
    return res.content ?? ''
  },
  writeFile: async (socket: Socket, deviceId: string, path: string, content: string, timeoutMs?: number): Promise<void> => {
    await requestFileWrite(socket, deviceId, path, content, timeoutMs)
  },
  deleteFile: async (socket: Socket, deviceId: string, path: string, timeoutMs?: number): Promise<void> => {
    await requestFileDelete(socket, deviceId, path, timeoutMs)
  },
  createDirectory: async (socket: Socket, deviceId: string, path: string, timeoutMs?: number): Promise<void> => {
    await requestFileMkdir(socket, deviceId, path, timeoutMs)
  },
}
