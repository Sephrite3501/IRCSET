import './config.js';
import app from './app.js';


const port = process.env.PORT || 3001;
const server = app.listen(port, () => {
  console.log(`API listening on ${port}`);
});

// Basic slowloris/abuse guardrails
server.requestTimeout = 30_000;   // 30s total per request
server.headersTimeout = 35_000;   // must exceed requestTimeout slightly
