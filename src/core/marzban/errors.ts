export class MarzbanError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly body?: unknown,
  ) {
    super(message)
    this.name = 'MarzbanError'
  }
}

export function isMarzbanError(err: unknown): err is MarzbanError {
  return err instanceof MarzbanError
}
