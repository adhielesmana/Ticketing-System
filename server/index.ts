import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";
import compression from "compression";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

const SessionStore = MemoryStore(session);

app.use(
  session({
    cookie: { maxAge: 86400000 },
    store: new SessionStore({
      checkPeriod: 86400000,
    }),
    resave: false,
    saveUninitialized: false,
    secret: process.env.SESSION_SECRET || "temp-secret",
  }),
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
app.use(compression({ threshold: 1024 }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const shouldLogApiRequests =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_API_LOGS === "true";
  const includeApiResponseBody =
    process.env.NODE_ENV !== "production" && process.env.ENABLE_API_BODY_LOGS !== "false";
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    if (includeApiResponseBody) {
      capturedJsonResponse = bodyJson;
    }
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") && shouldLogApiRequests) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse && includeApiResponseBody) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const hasDatabase = !!process.env.DATABASE_URL;

  if (!hasDatabase && process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production mode");
  }

  if (hasDatabase) {
    const { registerRoutes } = await import("./routes");
    await registerRoutes(httpServer, app);
  } else {
    log("DATABASE_URL is not set; starting in limited development mode", "startup");

    app.get("/api/health", (_req, res) => {
      res.json({
        ok: true,
        mode: "limited-dev",
        message: "Set DATABASE_URL to enable full API functionality",
      });
    });

    app.get("/api/auth/me", (_req, res) => {
      res.status(401).json({ message: "Not authenticated (limited mode)" });
    });
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  const onServerStarted = () => {
    log(`serving on port ${port}`);
    if (hasDatabase) {
      import("./routes").then(({ fixOrphanedAssignments, backfillTicketAreas, fixLegacyOverdueStatus }) => {
        fixOrphanedAssignments().catch(err => console.error("Fix orphaned assignments error:", err));
        backfillTicketAreas().catch(err => console.error("Backfill error:", err));
        fixLegacyOverdueStatus().catch(err => console.error("Fix overdue status error:", err));
      });

      const staleAssignmentMaxAgeHours = Math.max(
        1,
        parseInt(process.env.STALE_ASSIGNMENT_MAX_AGE_HOURS || "24", 10) || 24,
      );
      const staleAssignmentCheckIntervalMinutes = Math.max(
        1,
        parseInt(process.env.STALE_ASSIGNMENT_CHECK_INTERVAL_MINUTES || "15", 10) || 15,
      );
      let staleResetRunning = false;
      const runStaleAssignmentReset = async (source: string) => {
        if (staleResetRunning) return;
        staleResetRunning = true;
        try {
          const { storage } = await import("./storage");
          const count = await storage.bulkResetStaleAssignments(staleAssignmentMaxAgeHours);
          log(`${source}: ${count} stale assignment(s) cleared`);
        } catch (err) {
          console.error(`${source} error:`, err);
        } finally {
          staleResetRunning = false;
        }
      };

      void runStaleAssignmentReset("Stale assignment reset (startup)");
      setInterval(() => {
        void runStaleAssignmentReset("Stale assignment reset (scheduled)");
      }, staleAssignmentCheckIntervalMinutes * 60 * 1000);
      log(
        `Stale assignment scheduler every ${staleAssignmentCheckIntervalMinutes} minutes (max age ${staleAssignmentMaxAgeHours}h)`,
      );
    }
  };

  const shouldUseReusePort = process.env.ENABLE_REUSE_PORT === "true";
  const listenOptions: {
    port: number;
    host: string;
    reusePort?: boolean;
  } = {
    port,
    host: "0.0.0.0",
  };

  if (shouldUseReusePort) {
    listenOptions.reusePort = true;
  }

  httpServer.listen(listenOptions, onServerStarted);
})();
