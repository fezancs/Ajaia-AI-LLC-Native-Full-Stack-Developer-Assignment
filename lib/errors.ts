/** An error that is safe to show to the user, with the HTTP status to return. */
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
