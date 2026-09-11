// Callers anchor to their own consumer's terminal failure marker + sole-failed-job guard first,
// then call this on that anchored slice — it only matches the undici transport-cause fingerprint,
// not job scope. New undici/fetch transport fingerprints (header/body timeouts, socket errors)
// get their own named predicate here as they are observed, mirroring aws-transport-fingerprints.mts.

// undici "connect timeout": fetch could not establish a TCP/TLS connection before undici's connect
// timeout elapsed. Node prints the TypeError wrapper, the ConnectTimeoutError cause, and the
// UND_ERR_CONNECT_TIMEOUT code together.
export function hasUndiciConnectTimeout(text: string): boolean {
  return (
    text.includes('TypeError: fetch failed') &&
    text.includes('ConnectTimeoutError: Connect Timeout Error') &&
    text.includes("code: 'UND_ERR_CONNECT_TIMEOUT'")
  )
}

// undici "other side closed": the peer reset the TCP connection after fetch started. Node prints
// the TypeError wrapper, the SocketError cause, and the UND_ERR_SOCKET code together.
export function hasUndiciSocketClosed(text: string): boolean {
  return (
    text.includes('TypeError: fetch failed') &&
    text.includes('other side closed') &&
    text.includes("code: 'UND_ERR_SOCKET'")
  )
}

// undici "connection refused": fetch never established a TCP connection at all (the listening
// socket was gone). Unlike the other two fingerprints above, Node's cause here has no named error
// class (SocketError/ConnectTimeoutError) -- it's a plain `Error: connect ECONNREFUSED <addr>`.
// Confirmed against a real captured trace (#10819 fault injection):
//   TypeError: fetch failed
//   Caused by: Error: connect ECONNREFUSED 127.0.0.1:52846
//   Serialized Error: { errno: -61, code: 'ECONNREFUSED', syscall: 'connect', ... }
export function hasUndiciConnectionRefused(text: string): boolean {
  return (
    text.includes('TypeError: fetch failed') &&
    text.includes('Error: connect ECONNREFUSED') &&
    text.includes("code: 'ECONNREFUSED'")
  )
}
