class ApiError extends Error {
    constructor(status, message) {
        super();
        this.status = status;
        this.message = message;
    }

    static badRequest(message) {
        return new ApiError(400, message)
    }

    static forbidden(message) {
        return new ApiError(403, message)
    }

    static notFound(message) {
        return new ApiError(404, message)
    }

    static invalidValue(message) {
        return new ApiError(422, message)
    }

    static internalError(message) {
        return new ApiError(500, message)
    }
}

export default ApiError;