import { describe, expect, it } from 'vitest'
import {
  deploymentAccountId,
  deploymentAccountScope,
  MissingDeploymentAccountError,
} from './deployment-account'

const ID = '0d7c1a52-6f7e-4f43-9a7e-2f2a8f0c1b11'

describe('deploymentAccountId', () => {
  it('lê o id e tira espaços', () => {
    expect(deploymentAccountId(`  ${ID} `)).toBe(ID)
  })

  it('vazio ou ausente vira null', () => {
    expect(deploymentAccountId('')).toBeNull()
    expect(deploymentAccountId('   ')).toBeNull()
    expect(deploymentAccountId(undefined)).toBeNull()
  })
})

describe('deploymentAccountScope', () => {
  it('devolve a conta quando definida', () => {
    expect(deploymentAccountScope(ID, true)).toBe(ID)
    expect(deploymentAccountScope(ID, false)).toBe(ID)
  })

  it('sem conta e obrigatória: recusa em vez de adivinhar', () => {
    expect(() => deploymentAccountScope(undefined, true)).toThrow(MissingDeploymentAccountError)
    expect(() => deploymentAccountScope('  ', true)).toThrow(MissingDeploymentAccountError)
  })

  it('sem conta e opcional: modo antigo (null = todas)', () => {
    expect(deploymentAccountScope(undefined, false)).toBeNull()
  })
})
