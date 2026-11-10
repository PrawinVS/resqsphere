export function errorHandler(err, req, res, next) {
  console.error("[API Error]", err);

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(", ")
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid format for field "${err.path}"`
    });
  }

  return res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error"
  });
}

export default errorHandler;

