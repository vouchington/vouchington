// Suppress WARN-level messages from Glide's Rust logger without starting queue workers.
import { Logger } from '@valkey/valkey-glide'

Logger.setLoggerConfig('error')
