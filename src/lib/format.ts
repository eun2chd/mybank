const wonFmt = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export function won(n: number) {
  return wonFmt.format(Math.round(n));
}

export function wonShort(n: number) {
  if (n >= 100_000_000) return `₩${(n / 100_000_000).toFixed(2)}억`;
  if (n >= 10_000) return `₩${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;
  return won(n);
}

const amountInputFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });

/** 금액 입력 필드용 천 단위 콤마 */
export function formatAmountInput(value: string | number) {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return amountInputFmt.format(Number(digits));
}

/** 콤마가 포함된 금액 문자열 → 숫자 */
export function parseAmountInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function formatKoreanDate(date = new Date()) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  });
}

export function formatKoreanDateTime(date = new Date()) {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

export function formatMonthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

export function isCurrentMonth(year: number, month: number, date = new Date()) {
  return year === date.getFullYear() && month === date.getMonth() + 1;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
