import express, { type Express } from "express";
import type { Server } from "http";
import fs from "fs";
import path from "path";

/**
 * Geliştirme: Vite ara katman modunda çalışır, HMR httpServer üzerinden gider.
 * Üretim: `vite build` çıktısı dist/public'ten servis edilir.
 */
export async function setupVite(app: Express, httpServer: Server) {
  const { createServer: createViteServer } = await import("vite");

  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "custom",
    root: path.resolve(process.cwd(), "client"),
  });

  app.use(vite.middlewares);

  // API dışındaki tüm yollar SPA'ya düşer
  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    try {
      const templatePath = path.resolve(process.cwd(), "client", "index.html");
      let template = await fs.promises.readFile(templatePath, "utf-8");
      template = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      next(err);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Derleme çıktısı bulunamadı: ${distPath} — önce \`npm run build\` çalıştırın.`);
  }

  // Hash'li varlıklar uzun süre önbelleklenebilir, index.html asla
  app.use(
    express.static(distPath, {
      maxAge: "1y",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api")) return next();
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
