'use client'

import * as Toast from '@radix-ui/react-toast'

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider swipeDirection="right">
      {children}
      <Toast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-sm" />
    </Toast.Provider>
  )
}
