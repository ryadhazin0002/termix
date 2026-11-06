import test, { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { getSocket, disconnectSocket } from './socket'

describe('Socket singleton & lifecycle empirical verification', () => {
  beforeEach(() => {
    disconnectSocket()
  })

  afterEach(() => {
    disconnectSocket()
  })

  it('maintains singleton idempotency across sequential calls with the same token', () => {
    const s1 = getSocket('jwt-token-alpha')
    const s2 = getSocket('jwt-token-alpha')
    const s3 = getSocket('jwt-token-alpha')

    assert.strictEqual(s1, s2, 'Second call must return the exact same instance')
    assert.strictEqual(s2, s3, 'Third call must return the exact same instance')
  })

  it('maintains singleton idempotency under high concurrency calls', async () => {
    const promises = Array.from({ length: 50 }, () => Promise.resolve(getSocket('jwt-token-concurrent')))
    const results = await Promise.all(promises)

    const first = results[0]
    for (let i = 1; i < results.length; i++) {
      assert.strictEqual(results[i], first, `Concurrent call index ${i} must return the singleton instance`)
    }
  })

  it('recreates socket instance when token changes', () => {
    const socketUserA = getSocket('user-a-token')
    assert.equal((socketUserA.auth as Record<string, any>)?.token, 'user-a-token')

    // Now switch user / token to User B
    const socketUserB = getSocket('user-b-token')

    // 1. Previous socket must have been disconnected
    assert.equal(socketUserA.disconnected, true, 'Previous socket instance must be disconnected on token rotation')

    // 2. New socket instance must be returned
    assert.notStrictEqual(socketUserA, socketUserB, 'Different token must produce a new socket instance')
    assert.equal((socketUserB.auth as Record<string, any>)?.token, 'user-b-token')

    // 3. Subsequent calls with user-b-token return user B socket
    const socketUserBAgain = getSocket('user-b-token')
    assert.strictEqual(socketUserB, socketUserBAgain)
  })

  it('reconnects existing socket if it was disconnected', () => {
    const socket = getSocket('reconnect-token')

    // Explicitly disconnect the active socket
    socket.disconnect()
    assert.equal(socket.disconnected, true)

    // Calling getSocket with the same token should reconnect the existing socket instance
    const reconnectedSocket = getSocket('reconnect-token')
    assert.strictEqual(socket, reconnectedSocket, 'Should reuse the same socket instance on reconnection')
  })

  it('disconnectSocket() cleanly clears singleton reference and cached token', () => {
    const socket1 = getSocket('token-to-clear')

    disconnectSocket()
    assert.equal(socket1.disconnected, true, 'Active socket must be disconnected by disconnectSocket')

    // A subsequent getSocket call with the same token should instantiate a brand new socket
    const socket2 = getSocket('token-to-clear')
    assert.notStrictEqual(socket1, socket2, 'A fresh socket must be created after disconnectSocket()')
  })

  it('handles initial creation without token and subsequent re-auth with token', () => {
    const anonSocket = getSocket()
    assert.equal((anonSocket.auth as Record<string, any>)?.token, undefined)

    const authedSocket = getSocket('auth-token-123')
    assert.notStrictEqual(anonSocket, authedSocket, 'Socket should be recreated when transitioning from no-token to authed')
    assert.equal(anonSocket.disconnected, true)
    assert.equal((authedSocket.auth as Record<string, any>)?.token, 'auth-token-123')
  })
})
