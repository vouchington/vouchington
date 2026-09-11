import { describe, expect, it } from 'vitest'
import { assertPrivateKeyPem, assertPublicKeyPem, generateRsaSha256KeyPair } from './keys.mts'

describe('HTTP Signature key management', () => {
  describe('generateRsaSha256KeyPair', () => {
    it('generates a valid RSA-2048 keypair', () => {
      const keypair = generateRsaSha256KeyPair()

      expect(keypair.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----')
      expect(keypair.publicKeyPem).toContain('-----END PUBLIC KEY-----')
      expect(keypair.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----')
      expect(keypair.privateKeyPem).toContain('-----END PRIVATE KEY-----')
    })

    it('generates a unique keypair on each call', () => {
      const keypair1 = generateRsaSha256KeyPair()
      const keypair2 = generateRsaSha256KeyPair()

      expect(keypair1.publicKeyPem).not.toBe(keypair2.publicKeyPem)
      expect(keypair1.privateKeyPem).not.toBe(keypair2.privateKeyPem)
    })
  })

  describe('assertPublicKeyPem', () => {
    it('accepts a valid public key PEM', () => {
      const { publicKeyPem } = generateRsaSha256KeyPair()
      expect(() => assertPublicKeyPem(publicKeyPem)).not.toThrow()
    })

    it('rejects a string without a BEGIN marker', () => {
      expect(() => assertPublicKeyPem('not a valid PEM')).toThrow('Invalid public key PEM format')
    })

    it('rejects a string with BEGIN but no END marker', () => {
      expect(() => assertPublicKeyPem('-----BEGIN PUBLIC KEY-----\nabc')).toThrow(
        'Invalid public key PEM format',
      )
    })

    it('rejects an empty string', () => {
      expect(() => assertPublicKeyPem('')).toThrow('Invalid public key PEM format')
    })

    it('rejects truncated SPKI armor that still has BEGIN/END markers', () => {
      expect(() =>
        assertPublicKeyPem(
          '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----',
        ),
      ).toThrow('Invalid public key PEM format')
    })
  })

  describe('assertPrivateKeyPem', () => {
    it('accepts a valid private key PEM', () => {
      const { privateKeyPem } = generateRsaSha256KeyPair()
      expect(() => assertPrivateKeyPem(privateKeyPem)).not.toThrow()
    })

    it('rejects a string without a BEGIN marker', () => {
      expect(() => assertPrivateKeyPem('not a valid PEM')).toThrow('Invalid private key PEM format')
    })

    it('rejects a string with BEGIN but no END marker', () => {
      expect(() => assertPrivateKeyPem('-----BEGIN PRIVATE KEY-----\nabc')).toThrow(
        'Invalid private key PEM format',
      )
    })

    it('rejects an empty string', () => {
      expect(() => assertPrivateKeyPem('')).toThrow('Invalid private key PEM format')
    })
  })
})
