const serverless = require('serverless-http');
const app = require('../../server'); // Imports your Express app

// Export the serverless handler
module.exports.handler = serverless(app);
