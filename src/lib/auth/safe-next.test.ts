import { describe, expect, it } from 'vitest'
import { safeNextPath } from './safe-next'

describe('safeNextPath', () => {
  it('aceita caminho interno, com query', () => {
    expect(safeNextPath('/reset-password')).toBe('/reset-password')
    expect(safeNextPath('/inbox?c=1')).toBe('/inbox?c=1')
  })

  it('vazio ou ausente vai para o fallback', () => {
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath(undefined)).toBe('/dashboard')
    expect(safeNextPath('', '/login')).toBe('/login')
  })

  it('recusa endereço externo', () => {
    expect(safeNextPath('https://golpe.example')).toBe('/dashboard')
    expect(safeNextPath('//golpe.example')).toBe('/dashboard')
    expect(safeNextPath('/\\golpe.example')).toBe('/dashboard')
    expect(safeNextPath('javascript:alert(1)')).toBe('/dashboard')
  })

  it('recusa caracteres de controle (quebra de linha no header)', () => {
    expect(safeNextPath('/ok\r\nSet-Cookie: x=1')).toBe('/dashboard')
  })
})
