import type { DeviceStatus, DeviceStats, Device } from '../types/device.js'
import type { TerminalSession } from '../types/session.js'
import type { FileEntry } from '../types/file.js'

// --- File Operation Payloads ---
export interface FileListPayload { deviceId: string; path: string; requestId: string }
export interface FileListResultPayload { deviceId?: string; path: string; entries: FileEntry[]; error?: string; requestId: string }

export interface FileReadPayload { deviceId: string; path: string; requestId: string }
export interface FileReadResultPayload { deviceId?: string; path: string; content?: string; error?: string; requestId: string }

export interface FileWritePayload { deviceId: string; path: string; content: string; requestId: string }
export interface FileWriteResultPayload { deviceId?: string; path: string; success: boolean; error?: string; requestId: string }

export interface FileDeletePayload { deviceId: string; path: string; requestId: string }
export interface FileDeleteResultPayload { deviceId?: string; path: string; success: boolean; error?: string; requestId: string }

export interface FileMkdirPayload { deviceId: string; path: string; requestId: string }
export interface FileMkdirResultPayload { deviceId?: string; path: string; success: boolean; error?: string; requestId: string }

// Events sent from Client → Server
export type ClientToServerEvents = {
  'terminal:input': { sessionId: string; data: string }
  'terminal:resize': { sessionId: string; cols: number; rows: number }
  'terminal:create': { deviceId: string; cols: number; rows: number }
  'terminal:close': { sessionId: string }
  'device:subscribe': { deviceId: string }
  'device:unsubscribe': { deviceId: string }
  // File operations
  'file:list': FileListPayload
  'file:read': FileReadPayload
  'file:write': FileWritePayload
  'file:delete': FileDeletePayload
  'file:mkdir': FileMkdirPayload
}

// Events sent from Server → Client
export type ServerToClientEvents = {
  'terminal:output': { sessionId: string; data: string }
  'terminal:created': { session: TerminalSession }
  'terminal:closed': { sessionId: string; reason?: string }
  'terminal:error': { sessionId: string; message: string }
  'device:status': { deviceId: string; status: DeviceStatus }
  'device:stats': { deviceId: string; stats: DeviceStats }
  // File operation results
  'file:list:result': FileListResultPayload
  'file:read:result': FileReadResultPayload
  'file:write:result': FileWriteResultPayload
  'file:delete:result': FileDeleteResultPayload
  'file:mkdir:result': FileMkdirResultPayload
}

// Events between Agent and Server
export type AgentToServerEvents = {
  'agent:register': { device: Omit<Device, 'id' | 'ownerId' | 'createdAt'> }
  'agent:heartbeat': { deviceId: string; stats: DeviceStats }
  'agent:terminal:output': { sessionId: string; data: string }
  'agent:terminal:closed': { sessionId: string }
  // File operation results from Agent
  'file:list:result': FileListResultPayload
  'file:read:result': FileReadResultPayload
  'file:write:result': FileWriteResultPayload
  'file:delete:result': FileDeleteResultPayload
  'file:mkdir:result': FileMkdirResultPayload
}

export type ServerToAgentEvents = {
  'server:terminal:create': { sessionId: string; cols: number; rows: number }
  'server:terminal:input': { sessionId: string; data: string }
  'server:terminal:resize': { sessionId: string; cols: number; rows: number }
  'server:terminal:close': { sessionId: string }
  // File operations sent to Agent
  'file:list': { deviceId?: string; path: string; requestId: string }
  'file:read': { deviceId?: string; path: string; requestId: string }
  'file:write': { deviceId?: string; path: string; content: string; requestId: string }
  'file:delete': { deviceId?: string; path: string; requestId: string }
  'file:mkdir': { deviceId?: string; path: string; requestId: string }
}
