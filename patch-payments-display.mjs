/**
 * Admin panelindeki odeme listesinin iki hatasi.
 *
 * 1. TUTAR YANLIS GORUNUYOR
 *    payments.amount SENT cinsinden (semada yazili: "cent cinsinden").
 *    499 = $4.99 demek. Panel 100'e bolmuyor ve para birimini TL
 *    olarak sabit yaziyordu: "₺499,00". Kayit dogru, gosterim yanlis.
 *    Para birimi artik satirin kendi currency alanindan okunuyor.
 *
 * 2. KULLANICI ADI BOS
 *    getAllPayments yalnizca payments tablosundan seciyordu; kullaniciya
 *    hic baglanmiyordu. user_ref kolonunu eklemistik ama sorgu onu
 *    kullanmiyordu. Artik LEFT JOIN ile e-posta geliyor - LEFT cunku
 *    hesabi silinmis kullanicinin odemesi listede KALMALI (mali kayit).
 *
 * Kullanim (proje kokunde):  node patch-payments-display.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const targets = [
  {
    file: 'server/storage.ts',
    patches: [
      {
        name: 'getAllPayments: kullanici e-postasi ekleniyor',
        find: `  async getAllPayments() {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  },`,
        replace: `  async getAllPayments() {
    /* LEFT JOIN: hesabi silinmis kullanicinin odemesi de listede kalmali.
       payments.user_ref ON DELETE SET NULL, yani kisi baglantisi kopar
       ama mali kayit durur (VUK 5 yil, TTK 10 yil). */
    return db
      .select({
        id: payments.id,
        userId: payments.userId,
        userRef: payments.userRef,
        userEmail: users.email,
        userName: users.displayName,
        stripeSessionId: payments.stripeSessionId,
        amount: payments.amount,
        currency: payments.currency,
        productType: payments.productType,
        creditsAmount: payments.creditsAmount,
        status: payments.status,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .leftJoin(users, eq(users.id, payments.userRef))
      .orderBy(desc(payments.createdAt));
  },`,
      },
    ],
  },
  {
    file: 'client/src/pages/AdminDashboard.tsx',
    patches: [
      {
        name: 'money(): sent -> birim, para birimi satirdan',
        find: `  const money = (n: number | undefined) =>
    typeof n === "number" ? \`₺\${n.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}\` : "—";`,
        replace: `  /* payments.amount SENT cinsinden saklaniyor (semada yazili).
     499 = 4.99. Para birimi satirin kendi currency alanindan okunur;
     sabit ₺ yazmak USD odemeyi TL gibi gosteriyordu. */
  const money = (cents: number | undefined, currency = "usd") => {
    if (typeof cents !== "number") return "—";
    try {
      return new Intl.NumberFormat(currency === "try" ? "tr-TR" : "en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(cents / 100);
    } catch {
      return \`\${(cents / 100).toFixed(2)} \${currency.toUpperCase()}\`;
    }
  };`,
      },
      {
        name: 'Odeme satiri: e-posta ve dogru tutar',
        find: `                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{p.userEmail ?? p.email ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.itemName ?? p.productName ?? "—"} · {date(p.createdAt)}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary flex-shrink-0">
                  {money(Number(p.amount))}
                </span>`,
        replace: `                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">
                    {p.userEmail ?? (p.userId ? \`#\${p.userId}\` : "—")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.productType === "subscription"
                      ? "Premium"
                      : p.creditsAmount
                        ? \`\${p.creditsAmount} kredi\`
                        : "—"}
                    {" · "}
                    {p.status === "completed" ? "tamamlandı" : p.status}
                    {" · "}
                    {date(p.createdAt)}
                  </p>
                </div>
                <span className="text-sm font-bold text-primary flex-shrink-0">
                  {money(Number(p.amount), p.currency)}
                </span>`,
      },
      {
        name: 'Gelir karti: sent -> birim',
        find: `          value={money(revenue?.totalRevenue)}`,
        replace: `          value={money(revenue?.totalRevenue)}`,
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
  await fs.writeFile(`${file}.pd.bak`, source, 'utf8');
  console.log(`\n--- ${target.file}`);
  let out = source;
  for (const p of target.patches) {
    const n = out.split(p.find).length - 1;
    if (n !== 1) { console.error(`  ATLANDI  ${p.name} — ${n} eslesme`); failures.push(p.name); continue; }
    if (p.find === p.replace) { console.log(`  OK       ${p.name} (degisiklik gerekmedi)`); continue; }
    out = out.replace(p.find, p.replace);
    console.log(`  OK       ${p.name}`);
    total++;
  }
  if (out !== source) await fs.writeFile(file, out, 'utf8');
}
console.log(`\n${total} degisiklik uygulandi.`);
if (failures.length) { console.log('Atlananlar:', failures.join(', ')); process.exit(1); }
console.log('Sonraki adim: npm run build');
