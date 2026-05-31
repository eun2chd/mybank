import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { createPool, hasDatabaseConfig } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const pool = createPool();
const port = Number(process.env.PORT ?? 4000);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = /^http:\/\/(127\.0\.0\.1|localhost|192\.168\.\d+\.\d+)(:\d+)?$/;
    cb(null, allowed.test(origin));
  }
}));
app.use(express.json({ limit: "15mb" }));
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path} uid=${req.header("x-user-id") ?? "-"}`);
  next();
});
const distPath = path.join(__dirname, "../dist");
const hasDist = fs.existsSync(path.join(distPath, "index.html"));
if (hasDist) {
  app.use(express.static(distPath));
}

type UserRow = RowDataPacket & {
  id: number;
  email: string | null;
  nickname: string;
  password_hash: string | null;
};

function requirePool() {
  if (!pool) {
    throw Object.assign(new Error("Database is not configured."), { statusCode: 503 });
  }
  return pool;
}

function userIdFromRequest(req: express.Request) {
  const raw = req.header("x-user-id") ?? req.query.userId;
  const userId = Number(raw);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw Object.assign(new Error("Login is required."), { statusCode: 401 });
  }
  return userId;
}

function toNumber(value: unknown) {
  return Number(value ?? 0);
}

type CardPayload = {
  cardCompany: string;
  cardName: string;
  cardType: "debit" | "credit";
  accountId: number | null;
  accountNumber: string | null;
  cardNumber: string | null;
  balance: number;
  isShared: boolean;
  memo: string | null;
};

function parseCardPayload(body: Record<string, unknown>): CardPayload | { error: string } {
  const cardCompany = String(body.cardCompany ?? "").trim();
  const cardName = String(body.cardName ?? "").trim();
  const cardType = body.cardType === "credit" ? "credit" : "debit";
  const balance = toNumber(body.balance);
  const memo = body.memo ? String(body.memo).trim() : null;
  const accountIdRaw = body.accountId ?? body.account_id;
  const accountId =
    accountIdRaw !== "" && accountIdRaw != null && Number.isFinite(Number(accountIdRaw))
      ? Number(accountIdRaw)
      : null;
  const cardNumber =
    cardType === "credit" ? String(body.cardNumber ?? body.card_number ?? "").trim() || null : null;

  if (!cardCompany || !cardName) {
    return { error: "카드사와 카드명은 필수입니다." };
  }
  if (cardType === "debit" && (!accountId || accountId <= 0)) {
    return { error: "체크카드는 연결할 계좌를 선택해 주세요." };
  }
  if (cardType === "credit" && !cardNumber) {
    return { error: "신용카드는 카드번호를 입력해 주세요." };
  }
  if (!Number.isFinite(balance)) {
    return { error: "잔액이 올바르지 않습니다." };
  }
  const isShared = Boolean(body.isShared ?? body.is_shared);

  return {
    cardCompany,
    cardName,
    cardType,
    accountId: cardType === "debit" ? accountId : null,
    accountNumber: null,
    cardNumber,
    balance,
    isShared,
    memo
  };
}

async function resolveCardAccountLink(
  db: ReturnType<typeof requirePool>,
  userId: number,
  payload: CardPayload
): Promise<CardPayload | { error: string }> {
  if (payload.cardType !== "debit" || !payload.accountId) {
    return { ...payload, accountId: null, accountNumber: null };
  }

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, account_number AS accountNumber
     FROM accounts
     WHERE id = :accountId AND user_id = :userId AND is_active = TRUE`,
    { userId, accountId: payload.accountId }
  );

  if (!rows[0]) {
    return { error: "연결할 계좌를 찾을 수 없습니다. 계좌 관리에서 먼저 등록해 주세요." };
  }

  return {
    ...payload,
    accountNumber: rows[0].accountNumber ? String(rows[0].accountNumber) : null
  };
}

const ACCOUNT_TYPES = ["checking", "savings", "investment", "cash"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

type AccountPayload = {
  bankName: string;
  accountName: string;
  accountNumber: string | null;
  balance: number;
  accountType: AccountType;
  memo: string | null;
};

function parseAccountPayload(body: Record<string, unknown>): AccountPayload | { error: string } {
  const bankName = String(body.bankName ?? body.bank_name ?? "").trim();
  const accountName = String(body.accountName ?? body.account_name ?? "").trim();
  const accountNumber = String(body.accountNumber ?? body.account_number ?? "").trim() || null;
  const balance = toNumber(body.balance);
  const rawType = String(body.accountType ?? body.account_type ?? "checking");
  const accountType = (ACCOUNT_TYPES.includes(rawType as AccountType) ? rawType : "checking") as AccountType;
  const memo = body.memo ? String(body.memo).trim() : null;

  if (!bankName || !accountName) {
    return { error: "은행명과 계좌명은 필수입니다." };
  }
  if (!Number.isFinite(balance)) {
    return { error: "잔액이 올바르지 않습니다." };
  }

  return { bankName, accountName, accountNumber, balance, accountType, memo };
}

function mapAccountRow(row: RowDataPacket) {
  return {
    id: row.id,
    bankName: row.bankName ?? row.bank_name,
    accountName: row.accountName ?? row.account_name,
    accountNumber: row.accountNumber ?? row.account_number ?? null,
    balance: toNumber(row.balance),
    accountType: row.accountType ?? row.account_type ?? "checking",
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
    memo: row.memo ?? "",
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

const CATEGORY_TYPES = ["expense", "income", "investment", "transfer", "subscription"] as const;
type CategoryType = (typeof CATEGORY_TYPES)[number];

type CategoryPayload = {
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  sortOrder: number;
};

function parseCategoryPayload(body: Record<string, unknown>): CategoryPayload | { error: string } {
  const name = String(body.name ?? "").trim();
  const rawType = String(body.type ?? "expense");
  const type = (CATEGORY_TYPES.includes(rawType as CategoryType) ? rawType : "expense") as CategoryType;
  const color = String(body.color ?? "#2F80ED").trim() || "#2F80ED";
  const icon = body.icon ? String(body.icon).trim() : null;
  const sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0);

  if (!name) {
    return { error: "카테고리 이름은 필수입니다." };
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: "정렬 순서가 올바르지 않습니다." };
  }

  return { name, type, color, icon, sortOrder: Math.round(sortOrder) };
}

function mapCategoryRow(row: RowDataPacket) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color ?? "#2F80ED",
    icon: row.icon ?? null,
    sortOrder: Number(row.sort_order ?? 0)
  };
}

const OTHER_ASSET_TYPES = ["deposit", "loan", "debt", "other"] as const;
type OtherAssetType = (typeof OTHER_ASSET_TYPES)[number];

type OtherAssetPayload = {
  name: string;
  assetType: OtherAssetType;
  amount: number;
  expectedReturnDate: string | null;
  memo: string | null;
};

function parseOtherAssetPayload(body: Record<string, unknown>): OtherAssetPayload | { error: string } {
  const name = String(body.name ?? "").trim();
  const rawType = String(body.assetType ?? body.asset_type ?? "other");
  const assetType = (OTHER_ASSET_TYPES.includes(rawType as OtherAssetType) ? rawType : "other") as OtherAssetType;
  const amount = toNumber(body.amount);
  const expectedReturnDateRaw = body.expectedReturnDate ?? body.expected_return_date;
  const expectedReturnDate = expectedReturnDateRaw ? String(expectedReturnDateRaw).trim() : null;
  const memo = body.memo ? String(body.memo).trim() : null;

  if (!name) {
    return { error: "자산 이름은 필수입니다." };
  }
  if (!Number.isFinite(amount)) {
    return { error: "금액이 올바르지 않습니다." };
  }

  const normalizedAmount =
    assetType === "debt" ? -Math.abs(amount) : Math.abs(amount);

  return { name, assetType, amount: normalizedAmount, expectedReturnDate, memo };
}

function mapOtherAssetRow(row: RowDataPacket) {
  return {
    id: row.id,
    name: row.name,
    assetType: row.assetType ?? row.asset_type,
    amount: toNumber(row.amount),
    expectedReturnDate:
      row.expectedReturnDate != null
        ? formatDateValue(row.expectedReturnDate)
        : row.expected_return_date
          ? formatDateValue(row.expected_return_date)
          : null,
    memo: row.memo ?? "",
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

function mapCardRow(row: RowDataPacket) {
  const cardType = row.cardType ?? row.card_type;
  // 체크카드는 연결 계좌 잔액, 신용카드는 카드 자체 잔액
  const balance =
    cardType === "debit" && row.accountBalance != null
      ? toNumber(row.accountBalance)
      : toNumber(row.cardBalance ?? row.balance);

  return {
    id: row.id,
    cardCompany: row.cardCompany,
    cardName: row.cardName,
    cardType,
    accountId: row.accountId ?? row.account_id ?? null,
    accountLabel: row.accountLabel ?? null,
    accountNumber: row.accountNumber ?? null,
    cardNumber: row.cardNumber ?? null,
    balance,
    isShared: Boolean(row.isShared ?? row.is_shared ?? false),
    memo: row.memo ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

const PAYMENT_PLANS = ["lump_sum", "installment"] as const;
type PaymentPlan = (typeof PAYMENT_PLANS)[number];

type CardMemberPayload = {
  cardId: number;
  name: string;
  sortOrder: number;
};

type CardUsagePayload = {
  cardId: number;
  cardMemberId: number;
  usageDate: string;
  billingDate: string | null;
  paymentPlan: PaymentPlan;
  productName: string;
  productUrl: string | null;
  principalAmount: number;
  monthlyPayment: number;
  installmentMonths: number;
  memo: string | null;
  images: string[] | null;
};

function parseCardMemberPayload(body: Record<string, unknown>, cardId: number): CardMemberPayload | { error: string } {
  const name = String(body.name ?? "").trim();
  const sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0);
  if (!name) return { error: "사용자 이름은 필수입니다." };
  if (!Number.isFinite(sortOrder)) return { error: "정렬 순서가 올바르지 않습니다." };
  return { cardId, name, sortOrder: Math.round(sortOrder) };
}

function parseCardUsagePayload(body: Record<string, unknown>): CardUsagePayload | { error: string } {
  const cardId = Number(body.cardId ?? body.card_id);
  const cardMemberId = Number(body.cardMemberId ?? body.card_member_id);
  const usageDate = String(body.usageDate ?? body.usage_date ?? "").trim();
  const billingDateRaw = body.billingDate ?? body.billing_date;
  const billingDate = billingDateRaw ? String(billingDateRaw).trim() || null : null;
  const rawPlan = String(body.paymentPlan ?? body.payment_plan ?? "lump_sum");
  const paymentPlan = (PAYMENT_PLANS.includes(rawPlan as PaymentPlan) ? rawPlan : "lump_sum") as PaymentPlan;
  const productName = String(body.productName ?? body.product_name ?? "").trim();
  const productUrlRaw = body.productUrl ?? body.product_url;
  const productUrl = productUrlRaw ? String(productUrlRaw).trim() : null;
  const principalAmount = toNumber(body.principalAmount ?? body.principal_amount);
  let monthlyPayment = toNumber(body.monthlyPayment ?? body.monthly_payment);
  const installmentMonths = Math.max(1, Math.round(Number(body.installmentMonths ?? body.installment_months ?? 1)));
  const memo = body.memo ? String(body.memo).trim() : null;

  if (!Number.isInteger(cardId) || cardId <= 0) return { error: "카드를 선택해 주세요." };
  if (!Number.isInteger(cardMemberId) || cardMemberId <= 0) return { error: "사용자를 선택해 주세요." };
  if (!usageDate) return { error: "사용일은 필수입니다." };
  if (!productName) return { error: "제품명은 필수입니다." };
  if (!Number.isFinite(principalAmount) || principalAmount < 0) return { error: "원금이 올바르지 않습니다." };

  if (paymentPlan === "lump_sum") {
    monthlyPayment = principalAmount;
  } else if (!Number.isFinite(monthlyPayment) || monthlyPayment < 0) {
    if (installmentMonths > 0) {
      monthlyPayment = Math.round(principalAmount / installmentMonths);
    } else {
      return { error: "월 납부액이 올바르지 않습니다." };
    }
  }

  const imagesRaw = body.images;
  const images = Array.isArray(imagesRaw)
    ? (imagesRaw as unknown[])
        .filter((img): img is string => typeof img === "string" && img.startsWith("data:image/"))
        .slice(0, 10)
    : null;

  return {
    cardId,
    cardMemberId,
    usageDate,
    billingDate,
    paymentPlan,
    productName,
    productUrl,
    principalAmount,
    monthlyPayment,
    installmentMonths: paymentPlan === "lump_sum" ? 1 : installmentMonths,
    memo,
    images: images && images.length > 0 ? images : null
  };
}

function mapCardMemberRow(row: RowDataPacket) {
  return {
    id: row.id,
    cardId: row.cardId ?? row.card_id,
    name: row.name,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    isActive: Boolean(row.isActive ?? row.is_active ?? true)
  };
}

function mapCardUsageRow(row: RowDataPacket) {
  let images: string[] = [];
  try {
    const raw = row.images;
    if (raw) images = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch { /* empty */ }

  return {
    id: row.id,
    cardId: row.cardId ?? row.card_id,
    cardMemberId: row.cardMemberId ?? row.card_member_id,
    memberName: row.memberName ?? row.member_name,
    usageDate: formatDateValue(row.usage_date),
    billingDate: row.billing_date ? formatDateValue(row.billing_date) : null,
    paymentPlan: row.paymentPlan ?? row.payment_plan,
    productName: row.productName ?? row.product_name,
    productUrl: row.productUrl ?? row.product_url ?? null,
    principalAmount: toNumber(row.principalAmount ?? row.principal_amount),
    monthlyPayment: toNumber(row.monthlyPayment ?? row.monthly_payment),
    installmentMonths: Number(row.installmentMonths ?? row.installment_months ?? 1),
    memo: row.memo ?? "",
    images
  };
}

async function assertSharedCard(db: ReturnType<typeof requirePool>, userId: number, cardId: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM cards WHERE id = :cardId AND user_id = :userId AND is_shared = TRUE`,
    { userId, cardId }
  );
  return rows.length > 0;
}

async function createDefaultCategories(userId: number) {
  const db = requirePool();
  const defaults = [
    ["식비", "expense", "#2F80ED", 1],
    ["교통", "expense", "#4D96FF", 2],
    ["쇼핑", "expense", "#7FB4FF", 3],
    ["구독", "subscription", "#5B5BD6", 4],
    ["통신비", "expense", "#4D96FF", 5],
    ["서버비", "expense", "#2F80ED", 6],
    ["투자", "investment", "#3FD68C", 7],
    ["월급", "income", "#3FD68C", 8],
    ["기타", "expense", "#8B949E", 99]
  ];

  for (const [name, type, color, sortOrder] of defaults) {
    await db.execute(
      `INSERT INTO categories (user_id, name, type, color, sort_order)
       SELECT :userId, :name, :type, :color, :sortOrder
       WHERE NOT EXISTS (
         SELECT 1 FROM categories WHERE user_id = :userId AND name = :name
       )`,
      { userId, name, type, color, sortOrder }
    );
  }
}

const TRANSACTION_TYPE_KINDS = ["expense", "income", "neutral"] as const;
type TransactionTypeKind = (typeof TRANSACTION_TYPE_KINDS)[number];

async function createDefaultTransactionTypes(userId: number) {
  const db = requirePool();
  const defaults: Array<[string, string, TransactionTypeKind, number]> = [
    ["expense", "소비", "expense", 1],
    ["income", "수입", "income", 2],
    ["subscription", "구독", "expense", 3],
    ["investment_buy", "투자 매수", "expense", 4],
    ["investment_sell", "투자 매도", "income", 5],
    ["deposit", "입금", "income", 6],
    ["withdrawal", "출금", "expense", 7],
    ["transfer", "이체", "neutral", 8]
  ];

  for (const [code, name, kind, sortOrder] of defaults) {
    await db.execute(
      `INSERT INTO transaction_types (user_id, code, name, kind, sort_order, is_system)
       SELECT :userId, :code, :name, :kind, :sortOrder, TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM transaction_types WHERE user_id = :userId AND code = :code
       )`,
      { userId, code, name, kind, sortOrder }
    );
  }
}

type TransactionTypePayload = {
  code: string;
  name: string;
  kind: TransactionTypeKind;
  sortOrder: number;
};

function parseTransactionTypePayload(body: Record<string, unknown>): TransactionTypePayload | { error: string } {
  const code = String(body.code ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const name = String(body.name ?? "").trim();
  const rawKind = String(body.kind ?? "expense");
  const kind = (TRANSACTION_TYPE_KINDS.includes(rawKind as TransactionTypeKind)
    ? rawKind
    : "expense") as TransactionTypeKind;
  const sortOrder = Number(body.sortOrder ?? body.sort_order ?? 0);

  if (!code || !/^[a-z0-9_]+$/.test(code)) {
    return { error: "유형 코드는 영문 소문자, 숫자, 밑줄(_)만 사용할 수 있습니다." };
  }
  if (!name) {
    return { error: "유형 이름은 필수입니다." };
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: "정렬 순서가 올바르지 않습니다." };
  }

  return { code, name, kind, sortOrder: Math.round(sortOrder) };
}

function mapTransactionTypeRow(row: RowDataPacket) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    isSystem: Boolean(row.isSystem ?? row.is_system ?? false),
    isActive: Boolean(row.isActive ?? row.is_active ?? true)
  };
}

async function assertActiveTransactionType(db: ReturnType<typeof requirePool>, userId: number, code: string) {
  await createDefaultTransactionTypes(userId);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT code FROM transaction_types
     WHERE user_id = :userId AND code = :code AND is_active = TRUE`,
    { userId, code }
  );
  return rows.length > 0;
}

app.get("/api/health", async (_req, res) => {
  if (!hasDatabaseConfig() || !pool) {
    res.json({ ok: true, database: "not_configured" });
    return;
  }

  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    res.status(503).json({
      ok: false,
      database: "unreachable",
      message: error instanceof Error ? error.message : "Unknown database error"
    });
  }
});

app.post("/api/auth/simple-signup", async (req, res) => {
  const db = requirePool();
  const { email, nickname, password } = req.body as {
    email?: string;
    nickname?: string;
    password?: string;
  };

  if (!nickname?.trim()) {
    res.status(400).json({ message: "닉네임은 필수입니다." });
    return;
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const [result] = await db.execute<ResultSetHeader>(
    "INSERT INTO users (email, nickname, password_hash) VALUES (:email, :nickname, :passwordHash)",
    { email: email || null, nickname: nickname.trim(), passwordHash }
  );

  await createDefaultCategories(result.insertId);
  await createDefaultTransactionTypes(result.insertId);
  res.status(201).json({ id: result.insertId, email: email || null, nickname: nickname.trim() });
});

app.post("/api/auth/login", async (req, res) => {
  const db = requirePool();
  const { identifier, password } = req.body as { identifier?: string; password?: string };

  if (!identifier?.trim()) {
    res.status(400).json({ message: "이메일 또는 닉네임을 입력하세요." });
    return;
  }

  const [rows] = await db.execute<UserRow[]>(
    `SELECT id, email, nickname, password_hash
     FROM users
     WHERE is_active = TRUE AND (email = :identifier OR nickname = :identifier)
     ORDER BY id DESC
     LIMIT 1`,
    { identifier: identifier.trim() }
  );

  const user = rows[0];
  if (!user) {
    res.status(401).json({ message: "계정을 찾을 수 없습니다." });
    return;
  }

  if (user.password_hash) {
    const ok = Boolean(password) && (await bcrypt.compare(password!, user.password_hash));
    if (!ok) {
      res.status(401).json({ message: "비밀번호가 맞지 않습니다." });
      return;
    }
  }

  await createDefaultCategories(user.id);
  await createDefaultTransactionTypes(user.id);
  res.json({ id: user.id, email: user.email, nickname: user.nickname });
});

type DashboardMonthRange = {
  year: number;
  month: number;
  monthStart: string;
  monthEndExclusive: string;
  prevMonthStart: string;
  prevMonthEndExclusive: string;
};

function parseDashboardMonth(req: express.Request): DashboardMonthRange | { error: string } {
  const now = new Date();
  const yearRaw = req.query.year;
  const monthRaw = req.query.month;
  let year = yearRaw != null ? Number(yearRaw) : now.getFullYear();
  let month = monthRaw != null ? Number(monthRaw) : now.getMonth() + 1;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "연도가 올바르지 않습니다." };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "월이 올바르지 않습니다." };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const monthStart = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const monthEndExclusive = `${nextMonth.year}-${pad(nextMonth.month)}-01`;
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const prevMonthStart = `${prev.year}-${pad(prev.month)}-01`;
  const prevMonthEndExclusive = monthStart;

  return {
    year,
    month,
    monthStart,
    monthEndExclusive,
    prevMonthStart,
    prevMonthEndExclusive
  };
}

app.get("/api/dashboard", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const monthRange = parseDashboardMonth(req);
  if ("error" in monthRange) {
    res.status(400).json({ message: monthRange.error });
    return;
  }

  const { year, month, monthStart, monthEndExclusive, prevMonthStart, prevMonthEndExclusive } = monthRange;
  const monthParams = { userId, monthStart, monthEndExclusive };
  const prevMonthParams = { userId, monthStart: prevMonthStart, monthEndExclusive: prevMonthEndExclusive };
  await createDefaultTransactionTypes(userId);

  const [summaryRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN tt.kind = 'expense' THEN t.amount ELSE 0 END), 0) AS monthExpense,
       COALESCE(SUM(CASE WHEN tt.kind = 'income' THEN t.amount ELSE 0 END), 0) AS monthIncome
     FROM transactions t
     LEFT JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.is_active = TRUE
     WHERE t.user_id = :userId
       AND t.transaction_date >= :monthStart
       AND t.transaction_date < :monthEndExclusive`,
    monthParams
  );

  const [prevSummaryRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN tt.kind = 'expense' THEN t.amount ELSE 0 END), 0) AS monthExpense,
       COALESCE(SUM(CASE WHEN tt.kind = 'income' THEN t.amount ELSE 0 END), 0) AS monthIncome
     FROM transactions t
     LEFT JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.is_active = TRUE
     WHERE t.user_id = :userId
       AND t.transaction_date >= :monthStart
       AND t.transaction_date < :monthEndExclusive`,
    prevMonthParams
  );

  const [subscriptionRows] = await db.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) AS subscriptionTotal
     FROM subscriptions
     WHERE user_id = :userId AND status = 'active'`,
    { userId }
  );

  const [investmentRows] = await db.execute<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(total_buy_amount), 0) AS buyAmount,
       COALESCE(SUM(total_quantity * current_price), 0) AS currentValue
     FROM investments
     WHERE user_id = :userId AND is_active = TRUE`,
    { userId }
  );

  const [cardRows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.card_name AS name,
            COALESCE(SUM(CASE WHEN tt.id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS amount
     FROM cards c
     LEFT JOIN transactions t
       ON t.card_id = c.id
      AND t.user_id = c.user_id
      AND t.transaction_date >= :monthStart
      AND t.transaction_date < :monthEndExclusive
     LEFT JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.kind = 'expense' AND tt.is_active = TRUE
     WHERE c.user_id = :userId AND c.is_active = TRUE
     GROUP BY c.id, c.card_name
     ORDER BY amount DESC, c.id DESC`,
    monthParams
  );

  const [categoryRows] = await db.execute<RowDataPacket[]>(
    `SELECT ca.name, ca.color, COALESCE(SUM(t.amount), 0) AS amount
     FROM transactions t
     JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.kind = 'expense' AND tt.is_active = TRUE
     JOIN categories ca ON ca.id = t.category_id
     WHERE t.user_id = :userId
       AND t.transaction_date >= :monthStart
       AND t.transaction_date < :monthEndExclusive
     GROUP BY ca.id, ca.name, ca.color
     ORDER BY amount DESC
     LIMIT 8`,
    monthParams
  );

  const [recentRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, DATE_FORMAT(transaction_date, '%Y-%m-%d') AS date, title, merchant, amount, transaction_type AS type
     FROM transactions
     WHERE user_id = :userId
       AND transaction_date >= :monthStart
       AND transaction_date < :monthEndExclusive
     ORDER BY transaction_date DESC, id DESC
     LIMIT 10`,
    monthParams
  );

  const [upcomingRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name, amount, billing_cycle AS billingCycle, payment_day AS paymentDay,
            next_payment_date AS nextPaymentDate
     FROM subscriptions
     WHERE user_id = :userId AND status = 'active'`,
    { userId }
  );
  const upcomingSubscriptions = upcomingRows
    .map((row) => {
      const billingCycle = (row.billingCycle ?? "monthly") as BillingCycle;
      const paymentDay = row.paymentDay ?? null;
      const nextPaymentDate =
        computeNextPaymentDate(billingCycle, paymentDay) ??
        (row.nextPaymentDate ? formatDateValue(row.nextPaymentDate) : null);
      return {
        id: row.id,
        name: row.name,
        amount: toNumber(row.amount),
        nextPaymentDate
      };
    })
    .filter((row) => row.nextPaymentDate)
    .sort((a, b) => String(a.nextPaymentDate).localeCompare(String(b.nextPaymentDate)))
    .slice(0, 8);

  const [accountRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, bank_name AS bankName, account_name AS accountName, account_number AS accountNumber,
            balance
     FROM accounts
     WHERE user_id = :userId AND is_active = TRUE
     ORDER BY balance DESC, id DESC`,
    { userId }
  );

  const [holdingRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name, symbol, market,
            currency, original_price AS originalPrice,
            total_buy_amount AS buyAmount,
            total_quantity AS totalQuantity,
            average_price AS averagePrice,
            current_price AS currentPrice,
            total_quantity * current_price AS value,
            CASE
              WHEN total_buy_amount > 0
              THEN ((total_quantity * current_price - total_buy_amount) / total_buy_amount) * 100
              ELSE 0
            END AS returnRate
     FROM investments
     WHERE user_id = :userId AND is_active = TRUE
     ORDER BY value DESC, id DESC`,
    { userId }
  );

  const [trendRows] = await db.execute<RowDataPacket[]>(
    `SELECT CONCAT(MONTH(MIN(t.transaction_date)), '월') AS label,
            COALESCE(SUM(t.amount), 0) AS value
     FROM transactions t
     JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.kind = 'expense' AND tt.is_active = TRUE
     WHERE t.user_id = :userId
       AND t.transaction_date >= DATE_SUB(:monthStart, INTERVAL 5 MONTH)
       AND t.transaction_date < :monthEndExclusive
     GROUP BY YEAR(t.transaction_date), MONTH(t.transaction_date)
     ORDER BY YEAR(t.transaction_date), MONTH(t.transaction_date)`,
    monthParams
  );

  const [incomeBreakdownRows] = await db.execute<RowDataPacket[]>(
    `SELECT ca.name, COALESCE(SUM(t.amount), 0) AS amount
     FROM transactions t
     JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.kind = 'income' AND tt.is_active = TRUE
     LEFT JOIN categories ca ON ca.id = t.category_id
     WHERE t.user_id = :userId
       AND t.transaction_date >= :monthStart
       AND t.transaction_date < :monthEndExclusive
     GROUP BY ca.id, ca.name
     ORDER BY amount DESC
     LIMIT 4`,
    monthParams
  );

  const summary = summaryRows[0] ?? {};
  const prevSummary = prevSummaryRows[0] ?? {};
  const investment = investmentRows[0] ?? {};
  const buyAmount = toNumber(investment.buyAmount);
  const currentValue = toNumber(investment.currentValue);
  // 신용카드 잔액만 합산 (체크카드 잔액은 연결 계좌로 cashBalance에 이미 포함됨)
  const [cardBalanceRows] = await db.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(balance), 0) AS total
     FROM cards
     WHERE user_id = :userId AND is_active = TRUE AND card_type = 'credit'`,
    { userId }
  );

  const [otherAssetSumRows] = await db.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM other_assets WHERE user_id = :userId`,
    { userId }
  );

  const cashBalance = accountRows.reduce((sum, row) => sum + toNumber(row.balance), 0);
  const cardBalance = toNumber(cardBalanceRows[0]?.total);
  const otherAssetsBalance = toNumber(otherAssetSumRows[0]?.total);
  const stockValue = currentValue;
  const monthExpense = toNumber(summary.monthExpense);
  const monthIncome = toNumber(summary.monthIncome);
  const prevMonthExpense = toNumber(prevSummary.monthExpense);
  const prevMonthIncome = toNumber(prevSummary.monthIncome);
  const monthNet = monthIncome - monthExpense;
  const prevMonthNet = prevMonthIncome - prevMonthExpense;
  const monthBudget = Math.max(3_000_000, Math.round(monthIncome * 0.75));
  const totalAssets = cashBalance + cardBalance + otherAssetsBalance + stockValue;
  const assetChangeAmount = monthNet - prevMonthNet;
  const assetChangeRate =
    prevMonthNet !== 0 ? (assetChangeAmount / Math.abs(prevMonthNet)) * 100 : monthNet !== 0 ? 100 : 0;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  res.json({
    mode: "live",
    selectedYear: year,
    selectedMonth: month,
    isCurrentMonth,
    cashBalance,
    cardBalance,
    otherAssetsBalance,
    stockValue,
    totalAssets,
    assetChangeAmount,
    assetChangeRate,
    monthBudget,
    monthExpense,
    monthIncome,
    subscriptionTotal: toNumber(subscriptionRows[0]?.subscriptionTotal),
    investmentProfitRate: buyAmount > 0 ? ((currentValue - buyAmount) / buyAmount) * 100 : 0,
    investmentProfitAmount: currentValue - buyAmount,
    cards: cardRows.map((row) => ({ id: row.id, name: row.name, amount: toNumber(row.amount) })),
    categories: categoryRows.map((row) => ({
      name: row.name,
      amount: toNumber(row.amount),
      color: row.color ?? "#4D96FF"
    })),
    recentTransactions: recentRows.map((row) => ({
      id: row.id,
      date: row.date,
      title: row.title,
      merchant: row.merchant ?? "",
      amount: toNumber(row.amount),
      type: row.type
    })),
    upcomingSubscriptions,
    accounts: accountRows.map((row) => ({
      id: row.id,
      bankName: row.bankName,
      accountName: row.accountName,
      accountNumber: row.accountNumber ?? "",
      balance: toNumber(row.balance)
    })),
    holdings: holdingRows.map((row) => ({
      id: row.id,
      name: row.name,
      symbol: row.symbol ?? "",
      market: row.market ?? "",
      currency: String(row.currency ?? "KRW"),
      originalPrice: row.originalPrice != null ? toNumber(row.originalPrice) : null,
      buyAmount: toNumber(row.buyAmount),
      totalQuantity: toNumber(row.totalQuantity),
      averagePrice: toNumber(row.averagePrice),
      currentPrice: toNumber(row.currentPrice),
      value: toNumber(row.value),
      returnRate: toNumber(row.returnRate)
    })),
    monthlyTrend: trendRows.map((row) => ({
      label: row.label,
      value: toNumber(row.value) / 1_000_000,
      display: `₩${(toNumber(row.value) / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`
    })),
    incomeBreakdown: incomeBreakdownRows.map((row) => ({
      name: row.name ?? "기타",
      amount: toNumber(row.amount)
    }))
  });
});

app.get("/api/accounts", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, bank_name AS bankName, account_name AS accountName, account_number AS accountNumber,
            balance, account_type AS accountType, is_active AS isActive, memo,
            created_at AS createdAt, updated_at AS updatedAt
     FROM accounts
     WHERE user_id = :userId AND is_active = TRUE
     ORDER BY balance DESC, id DESC`,
    { userId }
  );
  res.json(rows.map(mapAccountRow));
});

app.post("/api/accounts", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseAccountPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO accounts (user_id, bank_name, account_name, account_number, balance, account_type, memo)
     VALUES (:userId, :bankName, :accountName, :accountNumber, :balance, :accountType, :memo)`,
    {
      userId,
      bankName: parsed.bankName,
      accountName: parsed.accountName,
      accountNumber: parsed.accountNumber,
      balance: parsed.balance,
      accountType: parsed.accountType,
      memo: parsed.memo
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/accounts/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(400).json({ message: "잘못된 계좌 ID입니다." });
    return;
  }

  const parsed = parseAccountPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE accounts
     SET bank_name = :bankName,
         account_name = :accountName,
         account_number = :accountNumber,
         balance = :balance,
         account_type = :accountType,
         memo = :memo
     WHERE id = :accountId AND user_id = :userId AND is_active = TRUE`,
    {
      userId,
      accountId,
      bankName: parsed.bankName,
      accountName: parsed.accountName,
      accountNumber: parsed.accountNumber,
      balance: parsed.balance,
      accountType: parsed.accountType,
      memo: parsed.memo
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "계좌를 찾을 수 없습니다." });
    return;
  }

  await db.execute(
    `UPDATE cards
     SET account_number = :accountNumber
     WHERE account_id = :accountId AND user_id = :userId`,
    { userId, accountId, accountNumber: parsed.accountNumber }
  );

  res.json({ ok: true });
});

app.delete("/api/accounts/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId) || accountId <= 0) {
    res.status(400).json({ message: "잘못된 계좌 ID입니다." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE cards SET account_id = NULL, account_number = NULL WHERE account_id = :accountId AND user_id = :userId`,
      { userId, accountId }
    );
    await connection.execute(
      `UPDATE transactions SET account_id = NULL WHERE account_id = :accountId AND user_id = :userId`,
      { userId, accountId }
    );
    await connection.execute(
      `UPDATE subscriptions SET account_id = NULL WHERE account_id = :accountId AND user_id = :userId`,
      { userId, accountId }
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE accounts SET is_active = FALSE WHERE id = :accountId AND user_id = :userId`,
      { userId, accountId }
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ message: "계좌를 찾을 수 없습니다." });
      return;
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.get("/api/cards", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.card_company AS cardCompany, c.card_name AS cardName,
            c.card_type AS cardType, c.account_id AS accountId, c.account_number AS accountNumber,
            c.card_number AS cardNumber,
            c.balance AS cardBalance,
            a.balance AS accountBalance,
            c.is_shared AS isShared, c.memo,
            c.created_at AS createdAt, c.updated_at AS updatedAt,
            CONCAT(a.bank_name, ' ', a.account_name) AS accountLabel
     FROM cards c
     LEFT JOIN accounts a ON a.id = c.account_id AND a.user_id = c.user_id AND a.is_active = TRUE
     WHERE c.user_id = :userId
     ORDER BY c.id DESC`,
    { userId }
  );
  res.json(rows.map(mapCardRow));
});

app.post("/api/cards", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseCardPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const linked = await resolveCardAccountLink(db, userId, parsed);
  if ("error" in linked) {
    res.status(400).json({ message: linked.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO cards (user_id, card_company, card_name, card_type, account_id, account_number, card_number, balance, is_shared, memo)
     VALUES (:userId, :cardCompany, :cardName, :cardType, :accountId, :accountNumber, :cardNumber, :balance, :isShared, :memo)`,
    {
      userId,
      cardCompany: linked.cardCompany,
      cardName: linked.cardName,
      cardType: linked.cardType,
      accountId: linked.accountId,
      accountNumber: linked.accountNumber,
      cardNumber: linked.cardNumber,
      balance: linked.balance,
      isShared: linked.isShared,
      memo: linked.memo
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/cards/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "잘못된 카드 ID입니다." });
    return;
  }

  const parsed = parseCardPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const linked = await resolveCardAccountLink(db, userId, parsed);
  if ("error" in linked) {
    res.status(400).json({ message: linked.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE cards
     SET card_company = :cardCompany,
         card_name = :cardName,
         card_type = :cardType,
         account_id = :accountId,
         account_number = :accountNumber,
         card_number = :cardNumber,
         balance = :balance,
         is_shared = :isShared,
         memo = :memo
     WHERE id = :cardId AND user_id = :userId`,
    {
      userId,
      cardId,
      cardCompany: linked.cardCompany,
      cardName: linked.cardName,
      cardType: linked.cardType,
      accountId: linked.accountId,
      accountNumber: linked.accountNumber,
      cardNumber: linked.cardNumber,
      balance: linked.balance,
      isShared: linked.isShared,
      memo: linked.memo
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "카드를 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/cards/shared", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.card_company AS cardCompany, c.card_name AS cardName,
            c.card_type AS cardType, c.balance, c.is_shared AS isShared, c.memo
     FROM cards c
     WHERE c.user_id = :userId AND c.is_shared = TRUE
     ORDER BY c.id DESC`,
    { userId }
  );
  res.json(rows.map(mapCardRow));
});

app.get("/api/card-members", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const cardId = Number(req.query.cardId ?? req.query.card_id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "카드를 선택해 주세요." });
    return;
  }
  if (!(await assertSharedCard(db, userId, cardId))) {
    res.status(404).json({ message: "공용 카드를 찾을 수 없습니다." });
    return;
  }
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, card_id AS cardId, name, sort_order AS sortOrder, is_active AS isActive
     FROM card_members
     WHERE user_id = :userId AND card_id = :cardId AND is_active = TRUE
     ORDER BY sort_order, id`,
    { userId, cardId }
  );
  res.json(rows.map(mapCardMemberRow));
});

app.post("/api/card-members", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const cardId = Number(req.body.cardId ?? req.body.card_id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "카드를 선택해 주세요." });
    return;
  }
  if (!(await assertSharedCard(db, userId, cardId))) {
    res.status(404).json({ message: "공용 카드를 찾을 수 없습니다." });
    return;
  }
  const parsed = parseCardMemberPayload(req.body, cardId);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  try {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO card_members (user_id, card_id, name, sort_order)
       VALUES (:userId, :cardId, :name, :sortOrder)`,
      { userId, cardId: parsed.cardId, name: parsed.name, sortOrder: parsed.sortOrder }
    );
    res.status(201).json({ id: result.insertId });
  } catch {
    res.status(400).json({ message: "이미 같은 이름의 사용자가 있습니다." });
  }
});

app.put("/api/card-members/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const memberId = Number(req.params.id);
  const cardId = Number(req.body.cardId ?? req.body.card_id);
  if (!Number.isInteger(memberId) || memberId <= 0 || !Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "잘못된 요청입니다." });
    return;
  }
  const parsed = parseCardMemberPayload(req.body, cardId);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE card_members SET name = :name, sort_order = :sortOrder
     WHERE id = :memberId AND user_id = :userId AND card_id = :cardId`,
    { userId, memberId, cardId, name: parsed.name, sortOrder: parsed.sortOrder }
  );
  if (result.affectedRows === 0) {
    res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/card-members/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const memberId = Number(req.params.id);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    res.status(400).json({ message: "잘못된 사용자 ID입니다." });
    return;
  }
  const [used] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM card_usage_entries WHERE card_member_id = :memberId AND user_id = :userId`,
    { userId, memberId }
  );
  if (Number(used[0]?.count) > 0) {
    res.status(400).json({ message: "사용 내역이 있는 사용자는 삭제할 수 없습니다." });
    return;
  }
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE card_members SET is_active = FALSE WHERE id = :memberId AND user_id = :userId`,
    { userId, memberId }
  );
  if (result.affectedRows === 0) {
    res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/card-usage/summary", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const cardId = Number(req.query.cardId ?? req.query.card_id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "카드를 선택해 주세요." });
    return;
  }
  const monthRange = parseDashboardMonth(req);
  if ("error" in monthRange) {
    res.status(400).json({ message: monthRange.error });
    return;
  }
  if (!(await assertSharedCard(db, userId, cardId))) {
    res.status(404).json({ message: "공용 카드를 찾을 수 없습니다." });
    return;
  }

  const [memberRows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name FROM card_members
     WHERE user_id = :userId AND card_id = :cardId AND is_active = TRUE
     ORDER BY sort_order, id`,
    { userId, cardId }
  );

  const [usageRows] = await db.execute<RowDataPacket[]>(
    `SELECT e.card_member_id AS cardMemberId,
            COALESCE(SUM(CASE WHEN e.payment_plan = 'lump_sum' THEN e.principal_amount ELSE 0 END), 0) AS lumpSumTotal,
            COALESCE(SUM(CASE WHEN e.payment_plan = 'installment' THEN e.monthly_payment ELSE 0 END), 0) AS installmentTotal,
            COUNT(e.id) AS entryCount
     FROM card_usage_entries e
     WHERE e.user_id = :userId AND e.card_id = :cardId
       AND COALESCE(e.billing_date, e.usage_date) >= :monthStart
       AND COALESCE(e.billing_date, e.usage_date) < :monthEndExclusive
     GROUP BY e.card_member_id`,
    { userId, cardId, monthStart: monthRange.monthStart, monthEndExclusive: monthRange.monthEndExclusive }
  );
  const usageMap = new Map(
    usageRows.map((row) => [
      Number(row.cardMemberId),
      {
        lumpSumTotal: toNumber(row.lumpSumTotal),
        installmentTotal: toNumber(row.installmentTotal),
        entryCount: Number(row.entryCount ?? 0)
      }
    ])
  );

  const members = memberRows.map((row) => {
    const stats = usageMap.get(Number(row.id)) ?? { lumpSumTotal: 0, installmentTotal: 0, entryCount: 0 };
    return {
      id: row.id,
      name: row.name,
      lumpSumTotal: stats.lumpSumTotal,
      installmentTotal: stats.installmentTotal,
      billingTotal: stats.lumpSumTotal + stats.installmentTotal,
      entryCount: stats.entryCount
    };
  });

  res.json({
    selectedYear: monthRange.year,
    selectedMonth: monthRange.month,
    members,
    grandLumpSum: members.reduce((s, m) => s + m.lumpSumTotal, 0),
    grandInstallment: members.reduce((s, m) => s + m.installmentTotal, 0),
    grandTotal: members.reduce((s, m) => s + m.billingTotal, 0)
  });
});

app.get("/api/card-usage", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const cardId = Number(req.query.cardId ?? req.query.card_id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "카드를 선택해 주세요." });
    return;
  }
  const monthRange = parseDashboardMonth(req);
  if ("error" in monthRange) {
    res.status(400).json({ message: monthRange.error });
    return;
  }
  if (!(await assertSharedCard(db, userId, cardId))) {
    res.status(404).json({ message: "공용 카드를 찾을 수 없습니다." });
    return;
  }

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT e.id, e.card_id AS cardId, e.card_member_id AS cardMemberId, m.name AS memberName,
            e.usage_date, e.billing_date, e.payment_plan AS paymentPlan, e.product_name AS productName,
            e.product_url AS productUrl, e.principal_amount AS principalAmount,
            e.monthly_payment AS monthlyPayment, e.installment_months AS installmentMonths,
            e.memo, e.images
     FROM card_usage_entries e
     JOIN card_members m ON m.id = e.card_member_id
     WHERE e.user_id = :userId AND e.card_id = :cardId
       AND COALESCE(e.billing_date, e.usage_date) >= :monthStart
       AND COALESCE(e.billing_date, e.usage_date) < :monthEndExclusive
     ORDER BY e.usage_date DESC, e.id DESC`,
    { userId, cardId, monthStart: monthRange.monthStart, monthEndExclusive: monthRange.monthEndExclusive }
  );
  res.json(rows.map(mapCardUsageRow));
});

app.post("/api/card-usage", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseCardUsagePayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  if (!(await assertSharedCard(db, userId, parsed.cardId))) {
    res.status(404).json({ message: "공용 카드를 찾을 수 없습니다." });
    return;
  }
  const [member] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM card_members
     WHERE id = :cardMemberId AND user_id = :userId AND card_id = :cardId AND is_active = TRUE`,
    { userId, cardMemberId: parsed.cardMemberId, cardId: parsed.cardId }
  );
  if (!member[0]) {
    res.status(400).json({ message: "카드 사용자를 선택해 주세요." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO card_usage_entries
       (user_id, card_id, card_member_id, usage_date, billing_date, payment_plan, product_name, product_url,
        principal_amount, monthly_payment, installment_months, memo, images)
     VALUES
       (:userId, :cardId, :cardMemberId, :usageDate, :billingDate, :paymentPlan, :productName, :productUrl,
        :principalAmount, :monthlyPayment, :installmentMonths, :memo, :images)`,
    { userId, ...parsed, images: parsed.images ? JSON.stringify(parsed.images) : null }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/card-usage/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const entryId = Number(req.params.id);
  const parsed = parseCardUsagePayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  if (!Number.isInteger(entryId) || entryId <= 0) {
    res.status(400).json({ message: "잘못된 내역 ID입니다." });
    return;
  }
  if (!(await assertSharedCard(db, userId, parsed.cardId))) {
    res.status(404).json({ message: "공용 카드를 찾을 수 없습니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE card_usage_entries
     SET card_member_id = :cardMemberId,
         usage_date = :usageDate,
         billing_date = :billingDate,
         payment_plan = :paymentPlan,
         product_name = :productName,
         product_url = :productUrl,
         principal_amount = :principalAmount,
         monthly_payment = :monthlyPayment,
         installment_months = :installmentMonths,
         memo = :memo,
         images = :images
     WHERE id = :entryId AND user_id = :userId AND card_id = :cardId`,
    { userId, entryId, ...parsed, images: parsed.images ? JSON.stringify(parsed.images) : null }
  );
  if (result.affectedRows === 0) {
    res.status(404).json({ message: "내역을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/card-usage/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    res.status(400).json({ message: "잘못된 내역 ID입니다." });
    return;
  }
  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM card_usage_entries WHERE id = :entryId AND user_id = :userId`,
    { userId, entryId }
  );
  if (result.affectedRows === 0) {
    res.status(404).json({ message: "내역을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/cards/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const cardId = Number(req.params.id);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    res.status(400).json({ message: "잘못된 카드 ID입니다." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE transactions SET card_id = NULL WHERE card_id = :cardId AND user_id = :userId`,
      { userId, cardId }
    );
    await connection.execute(
      `UPDATE subscriptions SET card_id = NULL WHERE card_id = :cardId AND user_id = :userId`,
      { userId, cardId }
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM cards WHERE id = :cardId AND user_id = :userId`,
      { userId, cardId }
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ message: "카드를 찾을 수 없습니다." });
      return;
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.get("/api/categories", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name, type, color, icon, sort_order
     FROM categories
     WHERE user_id = :userId
     ORDER BY sort_order, id`,
    { userId }
  );
  res.json(rows.map(mapCategoryRow));
});

app.post("/api/categories", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseCategoryPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [existing] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM categories WHERE user_id = :userId AND name = :name LIMIT 1`,
    { userId, name: parsed.name }
  );
  if (existing.length > 0) {
    res.status(400).json({ message: "이미 같은 이름의 카테고리가 있습니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO categories (user_id, name, type, color, icon, sort_order)
     VALUES (:userId, :name, :type, :color, :icon, :sortOrder)`,
    {
      userId,
      name: parsed.name,
      type: parsed.type,
      color: parsed.color,
      icon: parsed.icon,
      sortOrder: parsed.sortOrder
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/categories/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    res.status(400).json({ message: "잘못된 카테고리 ID입니다." });
    return;
  }

  const parsed = parseCategoryPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [duplicate] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM categories
     WHERE user_id = :userId AND name = :name AND id <> :categoryId
     LIMIT 1`,
    { userId, name: parsed.name, categoryId }
  );
  if (duplicate.length > 0) {
    res.status(400).json({ message: "이미 같은 이름의 카테고리가 있습니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE categories
     SET name = :name,
         type = :type,
         color = :color,
         icon = :icon,
         sort_order = :sortOrder
     WHERE id = :categoryId AND user_id = :userId`,
    {
      userId,
      categoryId,
      name: parsed.name,
      type: parsed.type,
      color: parsed.color,
      icon: parsed.icon,
      sortOrder: parsed.sortOrder
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "카테고리를 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/categories/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const categoryId = Number(req.params.id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    res.status(400).json({ message: "잘못된 카테고리 ID입니다." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE transactions SET category_id = NULL WHERE category_id = :categoryId AND user_id = :userId`,
      { userId, categoryId }
    );
    await connection.execute(
      `UPDATE subscriptions SET category_id = NULL WHERE category_id = :categoryId AND user_id = :userId`,
      { userId, categoryId }
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM categories WHERE id = :categoryId AND user_id = :userId`,
      { userId, categoryId }
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ message: "카테고리를 찾을 수 없습니다." });
      return;
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.get("/api/transaction-types", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  await createDefaultTransactionTypes(userId);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, code, name, kind, sort_order AS sortOrder, is_system AS isSystem, is_active AS isActive
     FROM transaction_types
     WHERE user_id = :userId AND is_active = TRUE
     ORDER BY sort_order, id`,
    { userId }
  );
  res.json(rows.map(mapTransactionTypeRow));
});

app.post("/api/transaction-types", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseTransactionTypePayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [existing] = await db.execute<RowDataPacket[]>(
    `SELECT id FROM transaction_types WHERE user_id = :userId AND code = :code LIMIT 1`,
    { userId, code: parsed.code }
  );
  if (existing.length > 0) {
    res.status(400).json({ message: "이미 같은 코드의 유형이 있습니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO transaction_types (user_id, code, name, kind, sort_order, is_system)
     VALUES (:userId, :code, :name, :kind, :sortOrder, FALSE)`,
    {
      userId,
      code: parsed.code,
      name: parsed.name,
      kind: parsed.kind,
      sortOrder: parsed.sortOrder
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/transaction-types/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const typeId = Number(req.params.id);
  if (!Number.isInteger(typeId) || typeId <= 0) {
    res.status(400).json({ message: "잘못된 유형 ID입니다." });
    return;
  }

  const parsed = parseTransactionTypePayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [current] = await db.execute<RowDataPacket[]>(
    `SELECT code, is_system AS isSystem FROM transaction_types WHERE id = :typeId AND user_id = :userId`,
    { userId, typeId }
  );
  if (!current[0]) {
    res.status(404).json({ message: "유형을 찾을 수 없습니다." });
    return;
  }

  const isSystem = Boolean(current[0].isSystem);
  const currentCode = String(current[0].code);
  if (isSystem && parsed.code !== currentCode) {
    res.status(400).json({ message: "기본 유형의 코드는 변경할 수 없습니다." });
    return;
  }

  if (!isSystem && parsed.code !== currentCode) {
    const [used] = await db.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM transactions WHERE user_id = :userId AND transaction_type = :code`,
      { userId, code: currentCode }
    );
    if (Number(used[0]?.count) > 0) {
      res.status(400).json({ message: "사용 중인 유형의 코드는 변경할 수 없습니다." });
      return;
    }
    const [dup] = await db.execute<RowDataPacket[]>(
      `SELECT id FROM transaction_types WHERE user_id = :userId AND code = :code AND id <> :typeId LIMIT 1`,
      { userId, code: parsed.code, typeId }
    );
    if (dup.length > 0) {
      res.status(400).json({ message: "이미 같은 코드의 유형이 있습니다." });
      return;
    }
    await db.execute(
      `UPDATE transactions SET transaction_type = :newCode WHERE user_id = :userId AND transaction_type = :oldCode`,
      { userId, newCode: parsed.code, oldCode: currentCode }
    );
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE transaction_types
     SET code = :code,
         name = :name,
         kind = :kind,
         sort_order = :sortOrder
     WHERE id = :typeId AND user_id = :userId`,
    {
      userId,
      typeId,
      code: parsed.code,
      name: parsed.name,
      kind: parsed.kind,
      sortOrder: parsed.sortOrder
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "유형을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/transaction-types/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const typeId = Number(req.params.id);
  if (!Number.isInteger(typeId) || typeId <= 0) {
    res.status(400).json({ message: "잘못된 유형 ID입니다." });
    return;
  }

  const [current] = await db.execute<RowDataPacket[]>(
    `SELECT code, is_system AS isSystem FROM transaction_types WHERE id = :typeId AND user_id = :userId`,
    { userId, typeId }
  );
  if (!current[0]) {
    res.status(404).json({ message: "유형을 찾을 수 없습니다." });
    return;
  }
  if (Boolean(current[0].isSystem)) {
    res.status(400).json({ message: "기본 유형은 삭제할 수 없습니다." });
    return;
  }

  const code = String(current[0].code);
  const [used] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS count FROM transactions WHERE user_id = :userId AND transaction_type = :code`,
    { userId, code }
  );
  if (Number(used[0]?.count) > 0) {
    res.status(400).json({ message: "소비 기록에서 사용 중인 유형은 삭제할 수 없습니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE transaction_types SET is_active = FALSE WHERE id = :typeId AND user_id = :userId`,
    { userId, typeId }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "유형을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/other-assets", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, name, asset_type AS assetType, amount,
            expected_return_date AS expectedReturnDate, memo,
            created_at AS createdAt, updated_at AS updatedAt
     FROM other_assets
     WHERE user_id = :userId
     ORDER BY amount DESC, id DESC`,
    { userId }
  );
  res.json(rows.map(mapOtherAssetRow));
});

app.post("/api/other-assets", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseOtherAssetPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO other_assets (user_id, name, asset_type, amount, expected_return_date, memo)
     VALUES (:userId, :name, :assetType, :amount, :expectedReturnDate, :memo)`,
    {
      userId,
      name: parsed.name,
      assetType: parsed.assetType,
      amount: parsed.amount,
      expectedReturnDate: parsed.expectedReturnDate,
      memo: parsed.memo
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/other-assets/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const assetId = Number(req.params.id);
  if (!Number.isInteger(assetId) || assetId <= 0) {
    res.status(400).json({ message: "잘못된 자산 ID입니다." });
    return;
  }

  const parsed = parseOtherAssetPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE other_assets
     SET name = :name,
         asset_type = :assetType,
         amount = :amount,
         expected_return_date = :expectedReturnDate,
         memo = :memo
     WHERE id = :assetId AND user_id = :userId`,
    {
      userId,
      assetId,
      name: parsed.name,
      assetType: parsed.assetType,
      amount: parsed.amount,
      expectedReturnDate: parsed.expectedReturnDate,
      memo: parsed.memo
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "자산을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/other-assets/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const assetId = Number(req.params.id);
  if (!Number.isInteger(assetId) || assetId <= 0) {
    res.status(400).json({ message: "잘못된 자산 ID입니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `DELETE FROM other_assets WHERE id = :assetId AND user_id = :userId`,
    { userId, assetId }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "자산을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

const BILLING_CYCLES = ["monthly", "yearly", "weekly", "custom"] as const;
const SUBSCRIPTION_STATUSES = ["active", "paused", "cancelled"] as const;
type BillingCycle = (typeof BILLING_CYCLES)[number];
type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

function localDateString(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** 월간 구독: payment_day 기준으로 오늘 이후 가장 가까운 결제일 */
function computeNextPaymentDate(billingCycle: BillingCycle, paymentDay: number | null): string | null {
  if (billingCycle !== "monthly" || paymentDay == null || paymentDay < 1 || paymentDay > 31) {
    return null;
  }
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const dayOfMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const onDay = (year: number, month: number) =>
    localDateString(year, month, Math.min(paymentDay, dayOfMonth(year, month)));

  const thisMonth = onDay(y, m);
  const todayStr = localDateString(y, m, today.getDate());
  if (thisMonth >= todayStr) {
    return thisMonth;
  }
  const nextM = m + 1;
  return nextM > 11 ? onDay(y + 1, 0) : onDay(y, nextM);
}

const MAX_SUBSCRIPTION_IMAGE_LENGTH = 600_000;

function parseSubscriptionImageUrl(body: Record<string, unknown>): string | null | { error: string } {
  const raw = body.imageUrl ?? body.image_url;
  if (raw === "" || raw == null) {
    return null;
  }
  const imageUrl = String(raw).trim();
  if (!imageUrl) {
    return null;
  }
  if (imageUrl.startsWith("data:image/")) {
    if (imageUrl.length > MAX_SUBSCRIPTION_IMAGE_LENGTH) {
      return { error: "이미지가 너무 큽니다. 300KB 이하로 올려 주세요." };
    }
    return imageUrl;
  }
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    if (imageUrl.length > 2048) {
      return { error: "이미지 URL이 너무 깁니다." };
    }
    return imageUrl;
  }
  return { error: "이미지는 URL 또는 업로드한 파일만 사용할 수 있습니다." };
}

type SubscriptionPayload = {
  name: string;
  imageUrl: string | null;
  amount: number;
  billingCycle: BillingCycle;
  paymentDay: number | null;
  nextPaymentDate: string | null;
  accountId: number | null;
  cardId: number | null;
  categoryId: number | null;
  status: SubscriptionStatus;
  memo: string | null;
};

function parseSubscriptionPayload(body: Record<string, unknown>): SubscriptionPayload | { error: string } {
  const name = String(body.name ?? "").trim();
  const amount = toNumber(body.amount);
  const rawCycle = String(body.billingCycle ?? body.billing_cycle ?? "monthly");
  const billingCycle = (BILLING_CYCLES.includes(rawCycle as BillingCycle) ? rawCycle : "monthly") as BillingCycle;
  const rawStatus = String(body.status ?? "active");
  const status = (SUBSCRIPTION_STATUSES.includes(rawStatus as SubscriptionStatus)
    ? rawStatus
    : "active") as SubscriptionStatus;
  const paymentDayRaw = body.paymentDay ?? body.payment_day;
  const paymentDay = paymentDayRaw !== "" && paymentDayRaw != null ? Number(paymentDayRaw) : null;
  const memo = body.memo ? String(body.memo).trim() : null;

  const accountIdRaw = body.accountId ?? body.account_id;
  const cardIdRaw = body.cardId ?? body.card_id;
  const categoryIdRaw = body.categoryId ?? body.category_id;

  if (!name) {
    return { error: "구독명은 필수입니다." };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "금액이 올바르지 않습니다." };
  }

  const imageUrlParsed = parseSubscriptionImageUrl(body);
  if (typeof imageUrlParsed === "object" && imageUrlParsed !== null && "error" in imageUrlParsed) {
    return imageUrlParsed;
  }

  const normalizedPaymentDay =
    paymentDay != null && Number.isFinite(paymentDay) ? paymentDay : null;

  return {
    name,
    imageUrl: imageUrlParsed,
    amount,
    billingCycle,
    paymentDay: normalizedPaymentDay,
    nextPaymentDate: computeNextPaymentDate(billingCycle, normalizedPaymentDay),
    accountId: accountIdRaw ? Number(accountIdRaw) : null,
    cardId: cardIdRaw ? Number(cardIdRaw) : null,
    categoryId: categoryIdRaw ? Number(categoryIdRaw) : null,
    status,
    memo
  };
}

function mapSubscriptionRow(row: RowDataPacket) {
  const billingCycle = (row.billingCycle ?? row.billing_cycle) as BillingCycle;
  const paymentDay = row.paymentDay ?? row.payment_day ?? null;
  const computedNext = computeNextPaymentDate(billingCycle, paymentDay);

  return {
    id: row.id,
    name: row.name,
    imageUrl: row.imageUrl ?? row.image_url ?? null,
    amount: toNumber(row.amount),
    billingCycle,
    paymentDay,
    nextPaymentDate:
      computedNext ??
      (row.nextPaymentDate != null
        ? formatDateValue(row.nextPaymentDate)
        : row.next_payment_date
          ? formatDateValue(row.next_payment_date)
          : null),
    accountId: row.accountId ?? row.account_id ?? null,
    cardId: row.cardId ?? row.card_id ?? null,
    categoryId: row.categoryId ?? row.category_id ?? null,
    status: row.status,
    cardLabel: row.cardLabel ?? null,
    categoryName: row.categoryName ?? null,
    memo: row.memo ?? "",
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

app.get("/api/subscriptions", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT s.id, s.name, s.image_url AS imageUrl, s.amount, s.billing_cycle AS billingCycle, s.payment_day AS paymentDay,
            s.next_payment_date AS nextPaymentDate, s.account_id AS accountId, s.card_id AS cardId,
            s.category_id AS categoryId, s.status, s.memo,
            s.created_at AS createdAt, s.updated_at AS updatedAt,
            CONCAT(c.card_company, ' ', c.card_name) AS cardLabel,
            ca.name AS categoryName
     FROM subscriptions s
     LEFT JOIN cards c ON c.id = s.card_id
     LEFT JOIN categories ca ON ca.id = s.category_id
     WHERE s.user_id = :userId
     ORDER BY FIELD(s.status, 'active', 'paused', 'cancelled'), s.next_payment_date IS NULL, s.next_payment_date ASC, s.id DESC`,
    { userId }
  );
  res.json(rows.map(mapSubscriptionRow));
});

app.post("/api/subscriptions", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseSubscriptionPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO subscriptions
       (user_id, name, image_url, amount, billing_cycle, payment_day, next_payment_date, account_id, card_id, category_id, status, memo)
     VALUES
       (:userId, :name, :imageUrl, :amount, :billingCycle, :paymentDay, :nextPaymentDate, :accountId, :cardId, :categoryId, :status, :memo)`,
    {
      userId,
      name: parsed.name,
      imageUrl: parsed.imageUrl,
      amount: parsed.amount,
      billingCycle: parsed.billingCycle,
      paymentDay: parsed.paymentDay,
      nextPaymentDate: parsed.nextPaymentDate,
      accountId: parsed.accountId,
      cardId: parsed.cardId,
      categoryId: parsed.categoryId,
      status: parsed.status,
      memo: parsed.memo
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/subscriptions/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const subscriptionId = Number(req.params.id);
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
    res.status(400).json({ message: "잘못된 구독 ID입니다." });
    return;
  }

  const parsed = parseSubscriptionPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE subscriptions
     SET name = :name,
         image_url = :imageUrl,
         amount = :amount,
         billing_cycle = :billingCycle,
         payment_day = :paymentDay,
         next_payment_date = :nextPaymentDate,
         account_id = :accountId,
         card_id = :cardId,
         category_id = :categoryId,
         status = :status,
         memo = :memo
     WHERE id = :subscriptionId AND user_id = :userId`,
    {
      userId,
      subscriptionId,
      name: parsed.name,
      imageUrl: parsed.imageUrl,
      amount: parsed.amount,
      billingCycle: parsed.billingCycle,
      paymentDay: parsed.paymentDay,
      nextPaymentDate: parsed.nextPaymentDate,
      accountId: parsed.accountId,
      cardId: parsed.cardId,
      categoryId: parsed.categoryId,
      status: parsed.status,
      memo: parsed.memo
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "구독을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/subscriptions/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const subscriptionId = Number(req.params.id);
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
    res.status(400).json({ message: "잘못된 구독 ID입니다." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE transactions SET subscription_id = NULL WHERE subscription_id = :subscriptionId AND user_id = :userId`,
      { userId, subscriptionId }
    );
    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM subscriptions WHERE id = :subscriptionId AND user_id = :userId`,
      { userId, subscriptionId }
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ message: "구독을 찾을 수 없습니다." });
      return;
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

const INVESTMENT_ASSET_TYPES = ["stock", "coin", "fund", "etc"] as const;
type InvestmentAssetType = (typeof INVESTMENT_ASSET_TYPES)[number];

// 시장별 통화 결정
function marketCurrency(market: string | null): string {
  if (!market) return "KRW";
  if (["NYSE", "NASDAQ", "AMEX", "BINANCE"].includes(market)) return "USD";
  if (market === "TSE") return "JPY";
  if (market === "HKEX") return "HKD";
  if (market === "LSE") return "GBP";
  return "KRW"; // KOSPI, KOSDAQ, UPBIT, BITHUMB
}

// 환율 캐시 (10분)
const rateCache = new Map<string, { rate: number; fetchedAt: number }>();

async function fetchKrwRate(currency: string): Promise<number> {
  if (currency === "KRW") return 1;
  const cached = rateCache.get(currency);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) return cached.rate;
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${currency}KRW=X`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!r.ok) return 0;
    const d = await r.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    const rate = d.chart?.result?.[0]?.meta?.regularMarketPrice ?? 0;
    if (rate > 0) rateCache.set(currency, { rate, fetchedAt: Date.now() });
    return rate;
  } catch {
    return 0;
  }
}

type InvestmentPayload = {
  name: string;
  assetType: InvestmentAssetType;
  market: string | null;
  symbol: string | null;
  currency: string;
  totalBuyAmount: number;
  totalQuantity: number;
  averagePrice: number;
  inputPrice: number;   // 사용자 입력 가격 (시장 통화 기준)
  memo: string | null;
};

function parseInvestmentPayload(body: Record<string, unknown>): InvestmentPayload | { error: string } {
  const name = String(body.name ?? "").trim();
  const rawType = String(body.assetType ?? body.asset_type ?? "stock");
  const assetType = (INVESTMENT_ASSET_TYPES.includes(rawType as InvestmentAssetType)
    ? rawType
    : "stock") as InvestmentAssetType;
  const market = body.market ? String(body.market).trim() : null;
  const symbol = body.symbol ? String(body.symbol).trim() : null;
  const currency = marketCurrency(market);
  const totalBuyAmount = toNumber(body.totalBuyAmount ?? body.total_buy_amount);
  const totalQuantity = toNumber(body.totalQuantity ?? body.total_quantity);
  const inputPrice = toNumber(body.currentPrice ?? body.current_price);
  const memo = body.memo ? String(body.memo).trim() : null;

  if (!name) {
    return { error: "종목명은 필수입니다." };
  }
  if (!Number.isFinite(totalBuyAmount) || !Number.isFinite(totalQuantity) || !Number.isFinite(inputPrice)) {
    return { error: "금액·수량·현재가가 올바르지 않습니다." };
  }

  const averagePrice =
    totalQuantity > 0
      ? toNumber(body.averagePrice ?? body.average_price) || totalBuyAmount / totalQuantity
      : 0;

  return {
    name,
    assetType,
    market,
    symbol,
    currency,
    totalBuyAmount,
    totalQuantity,
    averagePrice,
    inputPrice,
    memo
  };
}

function mapInvestmentRow(row: RowDataPacket) {
  const totalBuyAmount = toNumber(row.totalBuyAmount ?? row.total_buy_amount);
  const totalQuantity = toNumber(row.totalQuantity ?? row.total_quantity);
  const currentPrice = toNumber(row.currentPrice ?? row.current_price); // 항상 KRW
  const currency = String(row.currency ?? "KRW");
  const originalPrice = row.originalPrice != null ? toNumber(row.originalPrice) : null;
  const value = totalQuantity * currentPrice;
  const profitAmount = value - totalBuyAmount;
  const returnRate = totalBuyAmount > 0 ? (profitAmount / totalBuyAmount) * 100 : 0;

  return {
    id: row.id,
    name: row.name,
    assetType: row.assetType ?? row.asset_type,
    market: row.market ?? null,
    symbol: row.symbol ?? null,
    currency,
    originalPrice,
    totalBuyAmount,
    totalQuantity,
    averagePrice: toNumber(row.averagePrice ?? row.average_price),
    currentPrice,
    value,
    returnRate,
    profitAmount,
    isActive: row.isActive != null ? Boolean(row.isActive) : Boolean(row.is_active ?? true),
    memo: row.memo ?? "",
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  };
}

app.get("/api/investments", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, asset_type AS assetType, market, symbol, name,
            currency, original_price AS originalPrice,
            total_buy_amount AS totalBuyAmount, total_quantity AS totalQuantity,
            average_price AS averagePrice, current_price AS currentPrice,
            is_active AS isActive, memo, created_at AS createdAt, updated_at AS updatedAt
     FROM investments
     WHERE user_id = :userId AND is_active = TRUE
     ORDER BY (total_quantity * current_price) DESC, id DESC`,
    { userId }
  );
  res.json(rows.map(mapInvestmentRow));
});

app.post("/api/investments", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseInvestmentPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const { currency, inputPrice } = parsed;
  const krwRate = await fetchKrwRate(currency);
  const currentPrice = currency === "KRW" || krwRate <= 0 ? inputPrice : inputPrice * krwRate;
  const originalPrice = currency !== "KRW" && inputPrice > 0 ? inputPrice : null;

  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO investments
       (user_id, asset_type, market, symbol, name, currency, original_price,
        total_buy_amount, total_quantity, average_price, current_price, memo)
     VALUES
       (:userId, :assetType, :market, :symbol, :name, :currency, :originalPrice,
        :totalBuyAmount, :totalQuantity, :averagePrice, :currentPrice, :memo)`,
    {
      userId,
      assetType: parsed.assetType,
      market: parsed.market,
      symbol: parsed.symbol,
      name: parsed.name,
      currency,
      originalPrice,
      totalBuyAmount: parsed.totalBuyAmount,
      totalQuantity: parsed.totalQuantity,
      averagePrice: parsed.averagePrice,
      currentPrice,
      memo: parsed.memo
    }
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/investments/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const investmentId = Number(req.params.id);
  if (!Number.isInteger(investmentId) || investmentId <= 0) {
    res.status(400).json({ message: "잘못된 투자 ID입니다." });
    return;
  }

  const parsed = parseInvestmentPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }

  const { currency, inputPrice } = parsed;
  const krwRate = await fetchKrwRate(currency);
  const currentPrice = currency === "KRW" || krwRate <= 0 ? inputPrice : inputPrice * krwRate;
  const originalPrice = currency !== "KRW" && inputPrice > 0 ? inputPrice : null;

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE investments
     SET asset_type = :assetType,
         market = :market,
         symbol = :symbol,
         name = :name,
         currency = :currency,
         original_price = :originalPrice,
         total_buy_amount = :totalBuyAmount,
         total_quantity = :totalQuantity,
         average_price = :averagePrice,
         current_price = :currentPrice,
         memo = :memo,
         is_active = TRUE
     WHERE id = :investmentId AND user_id = :userId`,
    {
      userId,
      investmentId,
      assetType: parsed.assetType,
      market: parsed.market,
      symbol: parsed.symbol,
      name: parsed.name,
      currency,
      originalPrice,
      totalBuyAmount: parsed.totalBuyAmount,
      totalQuantity: parsed.totalQuantity,
      averagePrice: parsed.averagePrice,
      currentPrice,
      memo: parsed.memo
    }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "종목을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.delete("/api/investments/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const investmentId = Number(req.params.id);
  if (!Number.isInteger(investmentId) || investmentId <= 0) {
    res.status(400).json({ message: "잘못된 투자 ID입니다." });
    return;
  }

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE investments SET is_active = FALSE WHERE id = :investmentId AND user_id = :userId`,
    { userId, investmentId }
  );

  if (result.affectedRows === 0) {
    res.status(404).json({ message: "종목을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.post("/api/investments/refresh-prices", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT id, symbol, market FROM investments
     WHERE user_id = :userId AND is_active = TRUE
       AND symbol IS NOT NULL AND symbol != ''
       AND market IS NOT NULL AND market != ''`,
    { userId }
  );

  const updated: Array<{ id: number; currentPrice: number; originalPrice: number | null; currency: string }> = [];

  console.log(`[가격갱신] ${rows.length}개 종목 조회 시작`);

  await Promise.all(
    rows.map(async (row) => {
      const market = String(row.market);
      const symbol = String(row.symbol);
      const currency = marketCurrency(market);
      const originalPrice = await fetchCurrentPrice(symbol, market);
      console.log(`[가격갱신] ${symbol}(${market}) → ${originalPrice ?? "실패"} ${currency}`);
      if (originalPrice !== null && originalPrice > 0) {
        let currentPrice: number;
        if (currency === "KRW") {
          currentPrice = originalPrice;
        } else {
          const krwRate = await fetchKrwRate(currency);
          currentPrice = krwRate > 0 ? originalPrice * krwRate : 0;
        }
        if (currentPrice <= 0) return;
        await db.execute(
          `UPDATE investments
           SET current_price = :currentPrice,
               original_price = :originalPrice,
               currency = :currency
           WHERE id = :id AND user_id = :userId`,
          { currentPrice, originalPrice: currency !== "KRW" ? originalPrice : null, currency, id: row.id, userId }
        );
        updated.push({
          id: Number(row.id),
          currentPrice,
          originalPrice: currency !== "KRW" ? originalPrice : null,
          currency
        });
      }
    })
  );

  console.log(`[가격갱신] 완료: ${updated.length}/${rows.length}개 업데이트`);
  res.json({ updated: updated.length, prices: updated });
});

type TransactionPayload = {
  transactionDate: string;
  transactionType: string;
  amount: number;
  accountId: number | null;
  cardId: number | null;
  categoryId: number | null;
  merchant: string | null;
  title: string;
  memo: string | null;
  paymentMethod: string;
};

function parseTransactionPayload(body: Record<string, unknown>): TransactionPayload | { error: string } {
  const transactionDate = String(body.transactionDate ?? body.transaction_date ?? "").trim();
  const title = String(body.title ?? "").trim();
  const merchant = body.merchant ? String(body.merchant).trim() : null;
  const memo = body.memo ? String(body.memo).trim() : null;
  const transactionType = String(body.transactionType ?? body.transaction_type ?? "expense");
  const paymentMethod = String(body.paymentMethod ?? body.payment_method ?? "card");
  const amount = toNumber(body.amount);

  if (!transactionDate) {
    return { error: "날짜는 필수입니다." };
  }
  if (!title) {
    return { error: "내용은 필수입니다." };
  }
  if (!Number.isFinite(amount)) {
    return { error: "금액이 올바르지 않습니다." };
  }

  const accountIdRaw = body.accountId ?? body.account_id;
  const cardIdRaw = body.cardId ?? body.card_id;
  const categoryIdRaw = body.categoryId ?? body.category_id;

  let accountId =
    accountIdRaw !== "" && accountIdRaw != null && Number.isFinite(Number(accountIdRaw))
      ? Number(accountIdRaw)
      : null;
  let cardId =
    cardIdRaw !== "" && cardIdRaw != null && Number.isFinite(Number(cardIdRaw)) ? Number(cardIdRaw) : null;

  if (paymentMethod === "card") {
    accountId = null;
  } else if (paymentMethod === "account") {
    cardId = null;
  } else {
    accountId = null;
    cardId = null;
  }

  return {
    transactionDate,
    transactionType,
    amount,
    accountId,
    cardId,
    categoryId: categoryIdRaw ? Number(categoryIdRaw) : null,
    merchant,
    title,
    memo,
    paymentMethod
  };
}

type BalanceTarget =
  | { paymentMethod: "card"; cardId: number }
  | { paymentMethod: "account"; accountId: number };

type StoredTransactionBalance = {
  transactionType: string;
  amount: number;
  paymentMethod: string;
  cardId: number | null;
  accountId: number | null;
};

function resolveBalanceTarget(
  paymentMethod: string,
  cardId: number | null,
  accountId: number | null
): BalanceTarget | null {
  if (paymentMethod === "card" && cardId && cardId > 0) {
    return { paymentMethod: "card", cardId };
  }
  if (paymentMethod === "account" && accountId && accountId > 0) {
    return { paymentMethod: "account", accountId };
  }
  return null;
}

function balanceDeltaFromKind(kind: TransactionTypeKind | null | undefined, amount: number) {
  if (!kind || kind === "neutral") return 0;
  if (kind === "income") return amount;
  return -amount;
}

async function getTransactionTypeKind(
  db: PoolConnection | ReturnType<typeof requirePool>,
  userId: number,
  code: string
): Promise<TransactionTypeKind | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT kind FROM transaction_types
     WHERE user_id = :userId AND code = :code AND is_active = TRUE`,
    { userId, code }
  );
  const kind = rows[0]?.kind;
  return TRANSACTION_TYPE_KINDS.includes(kind as TransactionTypeKind) ? (kind as TransactionTypeKind) : null;
}

async function applyBalanceDelta(
  connection: PoolConnection,
  userId: number,
  target: BalanceTarget,
  delta: number
) {
  console.log(`[BALANCE] target=${JSON.stringify(target)} delta=${delta} userId=${userId}`);
  if (delta === 0) { console.log("[BALANCE] delta=0, skip"); return; }

  if (target.paymentMethod === "card") {
    const [cardRows] = await connection.execute<RowDataPacket[]>(
      `SELECT account_id AS accountId FROM cards WHERE id = :cardId AND user_id = :userId`,
      { cardId: target.cardId, userId }
    );
    console.log(`[BALANCE] card lookup cardId=${target.cardId}:`, JSON.stringify(cardRows[0]));
    if (!cardRows[0]) {
      throw Object.assign(new Error("카드를 찾을 수 없습니다."), { statusCode: 400 });
    }
    const linkedAccountId: number | null = cardRows[0].accountId ?? null;

    if (linkedAccountId) {
      console.log(`[BALANCE] 체크카드 → 계좌 ${linkedAccountId} delta=${delta}`);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE accounts SET balance = balance + :delta
         WHERE id = :linkedAccountId AND user_id = :userId AND is_active = TRUE`,
        { delta, linkedAccountId, userId }
      );
      console.log(`[BALANCE] 계좌 업데이트 affected=${result.affectedRows}`);
      if (result.affectedRows === 0) {
        throw Object.assign(new Error("연결된 계좌를 찾을 수 없습니다."), { statusCode: 400 });
      }
    } else {
      console.log(`[BALANCE] 신용카드 → 카드 ${target.cardId} delta=${delta}`);
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE cards SET balance = balance + :delta
         WHERE id = :cardId AND user_id = :userId AND is_active = TRUE`,
        { delta, cardId: target.cardId, userId }
      );
      if (result.affectedRows === 0) {
        throw Object.assign(new Error("카드를 찾을 수 없습니다."), { statusCode: 400 });
      }
    }
    return;
  }

  console.log(`[BALANCE] 계좌 직접 → accountId=${target.accountId} delta=${delta}`);
  const [result] = await connection.execute<ResultSetHeader>(
    `UPDATE accounts SET balance = balance + :delta
     WHERE id = :accountId AND user_id = :userId AND is_active = TRUE`,
    { delta, accountId: target.accountId, userId }
  );
  console.log(`[BALANCE] 계좌 업데이트 affected=${result.affectedRows}`);
  if (result.affectedRows === 0) {
    throw Object.assign(new Error("계좌를 찾을 수 없습니다."), { statusCode: 400 });
  }
}

async function applyTransactionBalanceEffect(
  connection: PoolConnection,
  userId: number,
  stored: StoredTransactionBalance,
  direction: 1 | -1
) {
  const kind = await getTransactionTypeKind(connection, userId, stored.transactionType);
  const delta = balanceDeltaFromKind(kind, stored.amount) * direction;
  const target = resolveBalanceTarget(stored.paymentMethod, stored.cardId, stored.accountId);
  if (!target || delta === 0) return;
  await applyBalanceDelta(connection, userId, target, delta);
}

async function fetchStoredTransaction(
  connection: PoolConnection,
  userId: number,
  transactionId: number
): Promise<StoredTransactionBalance | null> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT transaction_type, amount, payment_method, card_id, account_id
     FROM transactions WHERE id = :transactionId AND user_id = :userId`,
    { transactionId, userId }
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    transactionType: String(row.transaction_type),
    amount: toNumber(row.amount),
    paymentMethod: String(row.payment_method),
    cardId: row.card_id != null ? Number(row.card_id) : null,
    accountId: row.account_id != null ? Number(row.account_id) : null
  };
}

function computeTransactionNet(income: number, expense: number, transfer: number) {
  return income - expense - transfer;
}

function aggregateTotalsByKind(rows: Array<{ kind?: unknown; total?: unknown }>) {
  let expenseTotal = 0;
  let incomeTotal = 0;
  let transferTotal = 0;
  for (const row of rows) {
    const amount = toNumber(row.total);
    const kind = String(row.kind ?? "expense");
    if (kind === "income") incomeTotal += amount;
    else if (kind === "neutral") transferTotal += amount;
    else expenseTotal += amount;
  }
  return {
    expenseTotal,
    incomeTotal,
    transferTotal,
    net: computeTransactionNet(incomeTotal, expenseTotal, transferTotal)
  };
}

async function fetchMonthTotalsByKind(
  db: ReturnType<typeof requirePool>,
  userId: number,
  monthStart: string,
  monthEndExclusive: string
) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT COALESCE(tt.kind, 'expense') AS kind, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     LEFT JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.is_active = TRUE
     WHERE t.user_id = :userId
       AND t.transaction_date >= :monthStart
       AND t.transaction_date < :monthEndExclusive
     GROUP BY COALESCE(tt.kind, 'expense')`,
    { userId, monthStart, monthEndExclusive }
  );
  return aggregateTotalsByKind(rows as Array<{ kind?: unknown; total?: unknown }>);
}

function mapCategoryKindTotals(row: RowDataPacket) {
  const incomeTotal = toNumber(row.incomeTotal);
  const expenseTotal = toNumber(row.expenseTotal);
  const transferTotal = toNumber(row.transferTotal);
  return {
    incomeTotal,
    expenseTotal,
    transferTotal,
    net: incomeTotal - expenseTotal - transferTotal
  };
}

function formatDateValue(value: unknown) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value ?? "").slice(0, 10);
}

function mapTransactionRow(row: RowDataPacket) {
  return {
    id: row.id,
    transactionDate: formatDateValue(row.transaction_date),
    title: row.title,
    merchant: row.merchant ?? null,
    amount: toNumber(row.amount),
    transactionType: row.transaction_type,
    transactionTypeName: row.transaction_type_name ?? row.transactionTypeName ?? row.transaction_type,
    paymentMethod: row.payment_method,
    cardId: row.card_id ?? null,
    accountId: row.account_id ?? null,
    categoryId: row.category_id ?? null,
    categoryName: row.category_name ?? null,
    cardLabel: row.card_label ?? null,
    accountLabel: row.account_label ?? null,
    memo: row.memo ?? ""
  };
}

app.get("/api/transactions/type-summary", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const monthRange = parseDashboardMonth(req);
  if ("error" in monthRange) {
    res.status(400).json({ message: monthRange.error });
    return;
  }

  await createDefaultTransactionTypes(userId);
  const { year, month, monthStart, monthEndExclusive } = monthRange;

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT tt.code, tt.name, tt.kind,
            COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id) AS count
     FROM transaction_types tt
     LEFT JOIN transactions t
       ON t.user_id = tt.user_id
      AND t.transaction_type = tt.code
      AND t.transaction_date >= :monthStart
      AND t.transaction_date < :monthEndExclusive
     WHERE tt.user_id = :userId AND tt.is_active = TRUE
     GROUP BY tt.id, tt.code, tt.name, tt.kind, tt.sort_order
     ORDER BY tt.sort_order, tt.id`,
    { userId, monthStart, monthEndExclusive }
  );

  const types = rows.map((row) => ({
    code: row.code,
    name: row.name,
    kind: row.kind,
    total: toNumber(row.total),
    count: Number(row.count ?? 0)
  }));
  const grandTotal = types.reduce((sum, row) => sum + row.total, 0);
  const expenseTotal = types.filter((row) => row.kind === "expense").reduce((sum, row) => sum + row.total, 0);
  const incomeTotal = types.filter((row) => row.kind === "income").reduce((sum, row) => sum + row.total, 0);

  res.json({
    selectedYear: year,
    selectedMonth: month,
    grandTotal,
    expenseTotal,
    incomeTotal,
    types
  });
});

app.get("/api/transactions/category-summary", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const monthRange = parseDashboardMonth(req);
  if ("error" in monthRange) {
    res.status(400).json({ message: monthRange.error });
    return;
  }

  await createDefaultTransactionTypes(userId);
  const { year, month, monthStart, monthEndExclusive } = monthRange;
  const expenseOnly = req.query.expenseOnly !== "false" && req.query.expense_only !== "false";

  const categoryTypeFilter = expenseOnly ? "AND c.type = 'expense'" : "";

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT c.id, c.name, c.type, c.color, c.icon, c.sort_order AS sortOrder,
            COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id) AS count,
            COALESCE(SUM(CASE WHEN COALESCE(tt.kind, 'expense') = 'income' THEN t.amount ELSE 0 END), 0) AS incomeTotal,
            COALESCE(SUM(CASE WHEN COALESCE(tt.kind, 'expense') = 'expense' THEN t.amount ELSE 0 END), 0) AS expenseTotal,
            COALESCE(SUM(CASE WHEN tt.kind = 'neutral' THEN t.amount ELSE 0 END), 0) AS transferTotal
     FROM categories c
     LEFT JOIN transactions t
       ON t.user_id = c.user_id
      AND t.category_id = c.id
      AND t.transaction_date >= :monthStart
      AND t.transaction_date < :monthEndExclusive
     LEFT JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.is_active = TRUE
     WHERE c.user_id = :userId ${categoryTypeFilter}
     GROUP BY c.id, c.name, c.type, c.color, c.icon, c.sort_order
     ORDER BY c.sort_order, c.id`,
    { userId, monthStart, monthEndExclusive }
  );

  const [uncategorizedRows] = await db.execute<RowDataPacket[]>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total,
            COUNT(t.id) AS count,
            COALESCE(SUM(CASE WHEN COALESCE(tt.kind, 'expense') = 'income' THEN t.amount ELSE 0 END), 0) AS incomeTotal,
            COALESCE(SUM(CASE WHEN COALESCE(tt.kind, 'expense') = 'expense' THEN t.amount ELSE 0 END), 0) AS expenseTotal,
            COALESCE(SUM(CASE WHEN tt.kind = 'neutral' THEN t.amount ELSE 0 END), 0) AS transferTotal
     FROM transactions t
     LEFT JOIN transaction_types tt
       ON tt.user_id = t.user_id AND tt.code = t.transaction_type AND tt.is_active = TRUE
     WHERE t.user_id = :userId
       AND t.category_id IS NULL
       AND t.transaction_date >= :monthStart
       AND t.transaction_date < :monthEndExclusive`,
    { userId, monthStart, monthEndExclusive }
  );

  const uncategorizedRow = uncategorizedRows[0];
  const uncategorizedCount = Number(uncategorizedRow?.count ?? 0);
  const uncategorizedKind = mapCategoryKindTotals(uncategorizedRow ?? {});

  const categories = rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color ?? "#2F80ED",
    icon: row.icon ?? null,
    total: toNumber(row.total),
    count: Number(row.count ?? 0),
    ...mapCategoryKindTotals(row)
  }));

  if (uncategorizedCount > 0 || uncategorizedKind.net !== 0) {
    categories.push({
      id: null,
      name: "미분류",
      type: "expense",
      color: "#6B7280",
      icon: null,
      total: toNumber(uncategorizedRow?.total),
      count: uncategorizedCount,
      ...uncategorizedKind
    });
  }

  const monthTotals = await fetchMonthTotalsByKind(db, userId, monthStart, monthEndExclusive);

  res.json({
    selectedYear: year,
    selectedMonth: month,
    expenseOnly,
    ...monthTotals,
    categories
  });
});

app.get("/api/transactions", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const transactionType = req.query.transactionType ?? req.query.transaction_type;
  const typeCode = transactionType ? String(transactionType).trim() : null;
  const categoryIdRaw = req.query.categoryId ?? req.query.category_id;

  let monthStart: string | null = null;
  let monthEndExclusive: string | null = null;
  if (req.query.year != null || req.query.month != null) {
    const monthRange = parseDashboardMonth(req);
    if ("error" in monthRange) {
      res.status(400).json({ message: monthRange.error });
      return;
    }
    monthStart = monthRange.monthStart;
    monthEndExclusive = monthRange.monthEndExclusive;
  }

  const filters = ["t.user_id = :userId"];
  const params: {
    userId: number;
    monthStart?: string;
    monthEndExclusive?: string;
    typeCode?: string;
    categoryId?: number;
  } = { userId };

  if (monthStart && monthEndExclusive) {
    filters.push("t.transaction_date >= :monthStart");
    filters.push("t.transaction_date < :monthEndExclusive");
    params.monthStart = monthStart;
    params.monthEndExclusive = monthEndExclusive;
  }
  if (typeCode) {
    filters.push("t.transaction_type = :typeCode");
    params.typeCode = typeCode;
  }
  if (categoryIdRaw != null && String(categoryIdRaw).trim() !== "") {
    const raw = String(categoryIdRaw).trim();
    if (raw === "none" || raw === "uncategorized") {
      filters.push("t.category_id IS NULL");
    } else {
      const categoryId = Number(raw);
      if (Number.isInteger(categoryId) && categoryId > 0) {
        filters.push("t.category_id = :categoryId");
        params.categoryId = categoryId;
      }
    }
  }

  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT t.id, t.transaction_date, t.transaction_type, t.amount, t.payment_method,
            t.title, t.merchant, t.memo, t.card_id, t.account_id, t.category_id,
            c.name AS category_name,
            tt.name AS transaction_type_name,
            CONCAT(ca.card_company, ' ', ca.card_name) AS card_label,
            CONCAT(a.bank_name, ' ', a.account_name) AS account_label
     FROM transactions t
     LEFT JOIN transaction_types tt ON tt.user_id = t.user_id AND tt.code = t.transaction_type
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN cards ca ON ca.id = t.card_id
     LEFT JOIN accounts a ON a.id = t.account_id
     WHERE ${filters.join(" AND ")}
     ORDER BY t.transaction_date DESC, t.id DESC
     LIMIT 500`,
    params
  );
  res.json(rows.map(mapTransactionRow));
});

app.post("/api/transactions", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const parsed = parseTransactionPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  if (!(await assertActiveTransactionType(db, userId, parsed.transactionType))) {
    res.status(400).json({ message: "등록된 소비 유형을 선택해 주세요." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO transactions
         (user_id, transaction_date, transaction_type, amount, account_id, card_id, category_id,
          merchant, title, memo, payment_method, installment_months)
       VALUES
         (:userId, :transactionDate, :transactionType, :amount, :accountId, :cardId, :categoryId,
          :merchant, :title, :memo, :paymentMethod, 1)`,
      {
        userId,
        transactionDate: parsed.transactionDate,
        transactionType: parsed.transactionType,
        amount: parsed.amount,
        accountId: parsed.accountId,
        cardId: parsed.cardId,
        categoryId: parsed.categoryId,
        merchant: parsed.merchant,
        title: parsed.title,
        memo: parsed.memo,
        paymentMethod: parsed.paymentMethod
      }
    );

    await applyTransactionBalanceEffect(connection, userId, parsed, 1);
    await connection.commit();
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const transactionId = Number(req.params.id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    res.status(400).json({ message: "잘못된 거래 ID입니다." });
    return;
  }

  const parsed = parseTransactionPayload(req.body);
  if ("error" in parsed) {
    res.status(400).json({ message: parsed.error });
    return;
  }
  if (!(await assertActiveTransactionType(db, userId, parsed.transactionType))) {
    res.status(400).json({ message: "등록된 소비 유형을 선택해 주세요." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const previous = await fetchStoredTransaction(connection, userId, transactionId);
    if (!previous) {
      await connection.rollback();
      res.status(404).json({ message: "거래를 찾을 수 없습니다." });
      return;
    }

    await applyTransactionBalanceEffect(connection, userId, previous, -1);

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE transactions
       SET transaction_date = :transactionDate,
           transaction_type = :transactionType,
           amount = :amount,
           account_id = :accountId,
           card_id = :cardId,
           category_id = :categoryId,
           merchant = :merchant,
           title = :title,
           memo = :memo,
           payment_method = :paymentMethod
       WHERE id = :transactionId AND user_id = :userId`,
      {
        userId,
        transactionId,
        transactionDate: parsed.transactionDate,
        transactionType: parsed.transactionType,
        amount: parsed.amount,
        accountId: parsed.accountId,
        cardId: parsed.cardId,
        categoryId: parsed.categoryId,
        merchant: parsed.merchant,
        title: parsed.title,
        memo: parsed.memo,
        paymentMethod: parsed.paymentMethod
      }
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ message: "거래를 찾을 수 없습니다." });
      return;
    }

    await applyTransactionBalanceEffect(connection, userId, parsed, 1);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  const db = requirePool();
  const userId = userIdFromRequest(req);
  const transactionId = Number(req.params.id);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    res.status(400).json({ message: "잘못된 거래 ID입니다." });
    return;
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const previous = await fetchStoredTransaction(connection, userId, transactionId);
    if (!previous) {
      await connection.rollback();
      res.status(404).json({ message: "거래를 찾을 수 없습니다." });
      return;
    }

    await applyTransactionBalanceEffect(connection, userId, previous, -1);

    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM transactions WHERE id = :transactionId AND user_id = :userId`,
      { userId, transactionId }
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      res.status(404).json({ message: "거래를 찾을 수 없습니다." });
      return;
    }

    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

function toYahooSymbol(symbol: string, market: string): string | null {
  const suffixes: Record<string, string> = {
    KOSPI: ".KS", KOSDAQ: ".KQ", TSE: ".T", HKEX: ".HK", LSE: ".L"
  };
  if (suffixes[market]) return symbol + suffixes[market];
  if (["NYSE", "NASDAQ", "AMEX"].includes(market)) return symbol;
  return null;
}

async function fetchCurrentPrice(symbol: string, market: string): Promise<number | null> {
  try {
    if (market === "UPBIT") {
      const r = await fetch(`https://api.upbit.com/v1/ticker?markets=KRW-${symbol}`);
      if (!r.ok) return null;
      const d = await r.json() as Array<{ trade_price: number }>;
      return d[0]?.trade_price ?? null;
    }
    if (market === "BITHUMB") {
      const r = await fetch(`https://api.bithumb.com/public/ticker/${symbol}_KRW`);
      if (!r.ok) return null;
      const d = await r.json() as { data?: { closing_price?: string } };
      return d.data?.closing_price ? Number(d.data.closing_price) : null;
    }
    if (market === "BINANCE") {
      const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
      if (!r.ok) return null;
      const d = await r.json() as { price?: string };
      return d.price ? Number(d.price) : null;
    }
    const yahooSym = toYahooSymbol(symbol, market);
    if (!yahooSym) return null;
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!r.ok) return null;
    const d = await r.json() as {
      chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> };
    };
    return d.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

if (hasDist) {
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode =
    typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 500;
  res.status(statusCode).json({ message: error instanceof Error ? error.message : "Server error" });
});

app.listen(port, "0.0.0.0", async () => {
  console.log(`API server running on http://0.0.0.0:${port}`);

  if (!hasDatabaseConfig()) {
    console.warn("[DB] 환경변수 미설정 — DB 연결 없이 실행 중");
    return;
  }

  console.log(`[DB] 연결 시도: ${process.env.DB_HOST}:${process.env.DB_PORT} / ${process.env.DB_NAME}`);
  try {
    const conn = await pool!.getConnection();
    await conn.ping();
    conn.release();
    console.log("[DB] 연결 성공");
  } catch (err) {
    console.error("[DB] 연결 실패:", err instanceof Error ? err.message : err);
  }
});
