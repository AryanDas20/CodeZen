import express from 'express';
import app from './server/index.js';

// Express is imported at the deployment entrypoint for Vercel framework detection.
void express;

export default app;
