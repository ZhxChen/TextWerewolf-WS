import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/useAuthStore'

export function useLobbySocket(onMessage, enabled = true) {
  const socketRef = useRef(null)
  const token = useAuthStore((s) => s.token)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!enabled || !token) return undefined

    const socket = io('/', {
      auth: { token },
      query: { lobby: 'true' },
      transports: ['websocket', 'polling']
    })

    socketRef.current = socket
    socket.on('refreshLobby', () => onMessageRef.current('refreshLobby'))

    return () => {
      socket.disconnect()
    }
  }, [enabled, token])

  return socketRef
}
