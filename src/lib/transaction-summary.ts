export type TransactionTypeKind = "expense" | "income" | "neutral";

export type TransactionAmountRow = {
  amount: number;
  transactionType: string;
};

/**
 * 소비유형 kind 기준 (순계산 · 집계)
 * - income  → 더함 (+) · 수입
 * - expense → 나간 돈 (−) · 지출
 * - neutral → 나간 돈 (−) · 이체
 * 순 = 수입 − 지출 − 이체
 */
export function summarizeTransactionAmounts(
  transactions: TransactionAmountRow[],
  typeKindMap: Record<string, string>
) {
  let income = 0;
  let expense = 0;
  let transfer = 0;
  let transferCount = 0;

  for (const tx of transactions) {
    const kind = (typeKindMap[tx.transactionType] ?? "expense") as TransactionTypeKind;
    if (kind === "income") income += tx.amount;
    else if (kind === "expense") expense += tx.amount;
    else {
      transfer += tx.amount;
      transferCount += 1;
    }
  }

  return {
    income,
    expense,
    transfer,
    transferCount,
    net: computeTransactionNet(income, expense, transfer)
  };
}

/** 순 = 수입 − 지출 − 이체 */
export function computeTransactionNet(income: number, expense: number, transfer: number) {
  return income - expense - transfer;
}

export const TRANSACTION_KIND_AGGREGATE: Record<
  TransactionTypeKind,
  { aggregate: string; direction: string; hint: string }
> = {
  income: { aggregate: "수입", direction: "더함 (+)", hint: "수입 합계에 더하고, 순계산에서 더합니다" },
  expense: { aggregate: "지출", direction: "나간 돈 (−)", hint: "지출 합계에 포함, 순계산에서 뺍니다" },
  neutral: { aggregate: "이체", direction: "나간 돈 (−)", hint: "이체 합계에 포함, 순계산에서 뺍니다" }
};

type CategoryAmountRow = {
  type: string;
  incomeTotal: number;
  expenseTotal: number;
  transferTotal: number;
};

/** 카테고리 카드 — 집계(수입/지출) 기준 금액 */
export function categoryDisplayAmount(category: CategoryAmountRow) {
  if (category.type === "income") return category.incomeTotal;
  return category.expenseTotal;
}

export function categoryTransferAmount(category: CategoryAmountRow) {
  if (category.type === "income") return 0;
  return category.transferTotal;
}

export function categoryShareBase(
  summary: { incomeTotal: number; expenseTotal: number; transferTotal: number },
  category: CategoryAmountRow
) {
  if (category.type === "income") return summary.incomeTotal;
  return summary.expenseTotal;
}

export function categoryTransferShareBase(summary: { transferTotal: number }) {
  return summary.transferTotal;
}
