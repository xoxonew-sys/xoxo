/**
 * X-Room'u uygulamaya baglar:
 *   - /xroom rotasi (Protected: giris zorunlu, moderasyon icin kimlik sart)
 *   - Ana ekrana "X-Room" dugmesi, "Basla"nin yanina
 *
 * Kullanim (proje kokunde):  node patch-xroom-route.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  {
    file: 'client/src/App.tsx',
    patches: [
      {
        name: 'XRoom lazy import',
        find: `const Judgment = lazy(() => import("@/pages/Judgment"));`,
        replace: `const Judgment = lazy(() => import("@/pages/Judgment"));
const XRoom = lazy(() => import("@/pages/XRoom"));`,
      },
      {
        name: '/xroom rotasi',
        find: `                      <Route path="/judgment">`,
        replace: `                      <Route path="/xroom">
                        <Protected component={XRoom} />
                      </Route>
                      <Route path="/judgment">`,
      },
    ],
  },
  {
    file: 'client/src/pages/Home.tsx',
    patches: [
      {
        name: 'Ana ekrana X-Room dugmesi',
        find: `            {language === "tr" ? "Başla" : "Start"}
          </NeonButton>`,
        replace: `            {language === "tr" ? "Başla" : "Start"}
          </NeonButton>

          {/* Sureli, kendini imha eden grup sohbeti */}
          <button
            type="button"
            onClick={() => setLocation(isAuthenticated ? "/xroom" : "/login")}
            className="w-full py-3 rounded-full glass-panel text-sm flex items-center justify-center gap-2 hover:text-primary transition-colors"
            data-testid="home-xroom"
          >
            <Users className="w-4 h-4" />
            X-Room
          </button>`,
      },
      {
        name: 'Users ikonu import',
        find: `import { User, Zap } from "lucide-react";`,
        replace: `import { User, Zap, Users } from "lucide-react";`,
      },
    ],
  },
];

let total = 0;
const failures = [];
for (const target of targets) {
  const file = path.resolve(target.file);
  let source;
  try { source = await fs.readFile(file, 'utf8'); }
  catch { console.error(`BULUNAMADI ${target.file}`); failures.push(target.file); continue; }
  await fs.writeFile(`${file}.xr.bak`, source, 'utf8');
  console.log(`\n--- ${target.file}`);
  let out = source;
  for (const p of target.patches) {
    const n = out.split(p.find).length - 1;
    if (n !== 1) { console.error(`  ATLANDI  ${p.name} — ${n} eslesme`); failures.push(p.name); continue; }
    out = out.replace(p.find, p.replace);
    console.log(`  OK       ${p.name}`);
    total++;
  }
  if (out !== source) await fs.writeFile(file, out, 'utf8');
}
console.log(`\n${total} degisiklik uygulandi.`);
if (failures.length) { console.log('Atlananlar:', failures.join(', ')); process.exit(1); }
console.log('Sonraki adim: npm run build');
