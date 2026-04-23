import { describe, it, expect } from 'vitest'
import { MarzbanError, isMarzbanError } from '../errors'

describe('MarzbanError', () => {
  it('should construct with message and statusCode', () => {
    const error = new MarzbanError('Not found', 404)
    expect(error.message).toBe('Not found')
    expect(error.statusCode).toBe(404)
    expect(error.body).toBeUndefined()
    expect(error.name).toBe('MarzbanError')
  })

  it('should construct with message, statusCode, and body', () => {
    const body = { detail: 'User not found' }
    const error = new MarzbanError('Not found', 404, body)
    expect(error.message).toBe('Not found')
    expect(error.statusCode).toBe(404)
    expect(error.body).toEqual(body)
  })

  it('should be an instance of Error', () => {
    const error = new MarzbanError('fail', 500)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(MarzbanError)
  })
})

describe('isMarzbanError', () => {
  it('should return true for MarzbanError instances', () => {
    const error = new MarzbanError('test', 400)
    expect(isMarzbanError(error)).toBe(true)
  })

  it('should return false for regular Error instances', () => {
    const error = new Error('test')
    expect(isMarzbanError(error)).toBe(false)
  })

  it('should return false for non-error values', () => {
    expect(isMarzbanError(null)).toBe(false)
    expect(isMarzbanError(undefined)).toBe(false)
    expect(isMarzbanError('string')).toBe(false)
    expect(isMarzbanError(42)).toBe(false)
    expect(isMarzbanError({})).toBe(false)
  })
})
