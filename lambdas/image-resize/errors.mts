export class LambdaError extends Error {
  statusCode: number

  constructor(name: string, message: string, statusCode: number) {
    super(message)
    this.name = name
    this.statusCode = statusCode
  }
}

export class RequestParseError extends LambdaError {
  constructor(message: string, statusCode: number = 400) {
    super('RequestParseError', message, statusCode)
  }
}

export class S3OperationError extends LambdaError {
  constructor(message: string, statusCode: number = 500) {
    super('S3OperationError', message, statusCode)
  }
}

export class HttpOperationError extends LambdaError {
  constructor(message: string, statusCode: number = 500) {
    super('HttpOperationError', message, statusCode)
  }
}

export class TransformError extends LambdaError {
  constructor(message: string, statusCode: number = 500) {
    super('TransformError', message, statusCode)
  }
}
