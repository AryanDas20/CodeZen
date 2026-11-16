import express from 'express';
import brandWeaveApp from './server/index.js';

// Vercel detects this root-level Express application and sends requests to it
// as one Node.js Function. The existing backend remains in server/index.js.
const app = express();
app.use(brandWeaveApp);

export default app;
