class PublicDataError extends Error {
  constructor(status, code, message, internalReason) {
    super(message);
    this.status = status;
    this.code = code;
    this.internalReason = internalReason;
  }
}

const invalid = message => new PublicDataError(400, 'INVALID_ARGUMENT', message);
const notFound = () => new PublicDataError(404, 'NOT_FOUND', 'Requested resource was not found.');
const unavailable = reason => new PublicDataError(503, 'DATA_UNAVAILABLE', 'Requested data is temporarily unavailable.', reason);

module.exports = { PublicDataError, invalid, notFound, unavailable };
