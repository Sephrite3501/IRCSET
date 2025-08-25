export class ApiError extends Error {
  constructor(status = 500, message = 'Server error', details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
