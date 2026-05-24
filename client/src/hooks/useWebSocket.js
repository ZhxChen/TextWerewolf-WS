import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/useAuthStore'

export function useWebSocket(roomId, onMessage) {
  const socketRef = useRef(null)
  const token = useAuthStore((s) => s.token)
  // Keep a ref to onMessage so the socket effect never re-runs when the callback changes identity
  const onMessageRef = useRef(onMessage)
  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    if (!roomId || !token) return undefined

    const socket = io('/', {
      auth: { token },
      query: { roomId },
      transports: ['websocket', 'polling']
    })

    socketRef.current = socket

    const events = ['refreshRoom', 'refreshGame', 'gameStart', 'stageChange', 'gameOver', 'reStart', 'roomClosed', 'roomDeleted', 'kicked']
    events.forEach((event) => {
      socket.on(event, () => onMessageRef.current(event))
    })

    socket.on('timer', (data) => onMessageRef.current('timer', data))
    socket.on('chatMessage', (data) => onMessageRef.current('chatMessage', data))
    socket.on('chatError', (data) => onMessageRef.current('chatError', data))
    socket.on('wolfSelectionsUpdate', (data) => onMessageRef.current('wolfSelectionsUpdate', data))
    socket.on('predictorSelectionUpdate', (data) => onMessageRef.current('predictorSelectionUpdate', data))
    socket.on('witchSelectionsUpdate', (data) => onMessageRef.current('witchSelectionsUpdate', data))
    socket.on('voteSelectionsUpdate', (data) => onMessageRef.current('voteSelectionsUpdate', data))
    socket.on('playerOnlineStatus', (data) => onMessageRef.current('playerOnlineStatus', data))
    socket.on('connect', () => {
      console.log('WS connected')
      onMessageRef.current('connect')
    })
    socket.on('disconnect', () => console.log('WS disconnected'))

    return () => {
      socket.disconnect()
    }
  }, [roomId, token])

  return socketRef
}
