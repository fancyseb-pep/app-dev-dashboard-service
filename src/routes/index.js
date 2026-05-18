// src/routes/index.js
// Mounts all feature routers under /api.
// Add new routers here as new data sources come online.

import { Router } from "express";
import { auth } from "../middleware/auth.js";
import operationsRouter from "./operations.js";

const router = Router();

// Apply auth to all /api/* routes
router.use(auth);

// Feature routers
router.use("/operations", operationsRouter);

// Placeholder routes — uncomment and implement as you go:
// import roadmapRouter from "./roadmap.js";
// router.use("/roadmap", roadmapRouter);

// import automationsRouter from "./automations.js";
// router.use("/automations", automationsRouter);

// import piToCiRouter from "./piToCi.js";
// router.use("/pi-to-ci", piToCiRouter);

// import vulnerabilitiesRouter from "./vulnerabilities.js";
// router.use("/vulnerabilities", vulnerabilitiesRouter);

export default router;
