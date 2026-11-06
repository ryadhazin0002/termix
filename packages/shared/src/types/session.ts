export type SessionStatus = 'active' | 'closed' | 'error'

export interface TerminalSession {
  id: string
  deviceId: string
  userId: string
  status: SessionStatus
  createdAt: string
  closedAt?: string
  cols: number
  rows: number
}

export interface SessionRecording {
  sessionId: string
  events: RecordingEvent[]
}

export interface RecordingEvent {
  timestamp: number   // ms since session start
  type: 'output' | 'input' | 'resize'
  data: string
}
