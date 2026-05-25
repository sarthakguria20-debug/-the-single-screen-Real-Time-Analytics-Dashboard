import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- Real-time Stream Processing Logic ---
  const WINDOW_SIZE = 60; // 60 seconds rolling window
  let timeSeriesBuffer: number[] = Array(WINDOW_SIZE).fill(0);
  let currentSlotIndex = 0;
  let lastSlotTime = Math.floor(Date.now() / 1000);
  let maxTrafficEver = 0; // Highest events in a single second

  let sseClients: express.Response[] = [];

  // Window sliding logic
  function tickWindow() {
    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastSlotTime;
    
    if (elapsed > 0) {
      // Clear elapsed slots in the circular buffer
      for (let i = 1; i <= Math.min(elapsed, WINDOW_SIZE); i++) {
        currentSlotIndex = (currentSlotIndex + 1) % WINDOW_SIZE;
        timeSeriesBuffer[currentSlotIndex] = 0;
      }
      lastSlotTime = now;
    }
  }

  // High-throughput Ingestion API
  // Uses O(1) in-memory aggregation instead of hitting a DB per click
  app.post("/api/events", (req, res) => {
    tickWindow();
    // Simulate real traffic vs burst tool. 
    // Usually each req is 1, but we allow 'batch' sizes for load-testing simulation.
    const count = parseInt(req.body.count, 10) || 1;
    timeSeriesBuffer[currentSlotIndex] += count;
    
    if (timeSeriesBuffer[currentSlotIndex] > maxTrafficEver) {
        maxTrafficEver = timeSeriesBuffer[currentSlotIndex];
    }
    
    // 202 Accepted: Event stored for asynchronous processing
    res.status(202).json({ status: "accepted" }); 
  });

  // Client Subscription Endpoint (SSE)
  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    // Send an initial heartbeat
    res.write(`data: ${JSON.stringify({ heartbeat: true })}\n\n`);
    
    sseClients.push(res);
    
    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  });

  // Analytics Broadcaster
  // Runs periodically to broadcast state to all subscribed dashboards
  setInterval(() => {
    tickWindow();

    const now = new Date();
    const series = [];
    let activeUsers60s = 0;
    
    // Construct the timeline from oldest to newest slot
    for (let i = 0; i < WINDOW_SIZE; i++) {
        const idx = (currentSlotIndex + 1 + i) % WINDOW_SIZE;
        const val = timeSeriesBuffer[idx];
        
        // Calculate timestamp for this slot
        const slotTime = new Date(now.getTime() - ((WINDOW_SIZE - 1 - i) * 1000));
        
        series.push({
            time: slotTime.toLocaleTimeString([], { hour12: false, second: '2-digit', minute: '2-digit', hour: '2-digit' }),
            events: val
        });
        activeUsers60s += val;
    }
    
    const payload = JSON.stringify({ 
        series, 
        activeUsers60s,
        currentEventsPerSecond: timeSeriesBuffer[currentSlotIndex],
        maxTrafficEver
    });
    
    sseClients.forEach(client => {
      // Use standard SSE format
      client.write(`data: ${payload}\n\n`);
    });
  }, 1000);

  // --- Vite Middleware for Development ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // For Express v4:
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
