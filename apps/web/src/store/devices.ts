import { create } from 'zustand'
import type { Device } from '@termix/shared'

interface DevicesState {
  devices: Device[]
  loading: boolean
  setDevices: (devices: Device[]) => void
  addDevice: (device: Device) => void
  updateDevice: (id: string, updates: Partial<Device>) => void
  removeDevice: (id: string) => void
  setLoading: (loading: boolean) => void
}

export const useDevicesStore = create<DevicesState>((set) => ({
  devices: [],
  loading: false,
  setDevices: (devices) => set({ devices }),
  addDevice: (device) =>
    set((state) => ({
      devices: [device, ...state.devices.filter((d) => d.id !== device.id)],
    })),
  updateDevice: (id, updates) =>
    set((state) => ({
      devices: state.devices.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    })),
  removeDevice: (id) =>
    set((state) => ({
      devices: state.devices.filter((d) => d.id !== id),
    })),
  setLoading: (loading) => set({ loading }),
}))
