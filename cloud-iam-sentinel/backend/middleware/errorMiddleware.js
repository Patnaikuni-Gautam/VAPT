const errorHandler = (err, req, res, next) => {
  // Default to 500 server error if status code not set
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Log errors with request information for better debugging
  console.error(`[${new Date().toISOString()}] Error ${statusCode}: ${err.message}`);
  console.error(`Request: ${req.method} ${req.originalUrl}`);
  
  if (err.name === 'ValidationError') {
    // Handle Mongoose validation errors
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: Object.values(err.errors).map(e => e.message),
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  } else if (err.name === 'MongoServerError' && err.code === 11000) {
    // Handle duplicate key errors
    return res.status(400).json({
      success: false,
      message: 'Duplicate field value entered',
      field: Object.keys(err.keyValue)[0],
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  } else if (err.name === 'CastError') {
    // Handle invalid MongoDB ObjectId
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
  }
  
  // Standard error response
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Server Error',
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

// Not Found middleware
const notFound = (req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = { errorHandler, notFound };