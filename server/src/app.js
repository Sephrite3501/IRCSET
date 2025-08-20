import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { standardLimiter } from './middleware/rateLimiter.js';


import health from './routes/health.js';
import auth from './routes/auth.js';
import submissions from './routes/submissions.js';
import chair from './routes/chair.js';
import reviewer from './routes/reviewer.js';
import decisions from './routes/decisions.js';
import admin from './routes/admin.js';
import finalRoutes from './routes/final.js';


const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(standardLimiter);


app.use(health);
app.use(auth);
app.use(submissions);
app.use(chair);
app.use(reviewer);
app.use(decisions);
app.use(admin);
app.use(finalRoutes);


app.get('/', (req, res) => res.json({ name: 'IRCSET API' }));


export default app;