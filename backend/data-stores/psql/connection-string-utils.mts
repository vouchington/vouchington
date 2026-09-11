// pg v8 treats sslmode=require as verify-full, but the Amazon RDS CA is not
// bundled in the distroless container. uselibpqcompat=true restores libpq
// semantics: require TLS without verifying the CA chain.
export { withLibpqCompat } from '@vouchington/postgres'
