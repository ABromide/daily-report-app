import type { Locale } from "./i18n";

function localeCode(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}

export function formatDateTime(value: string, locale: Locale = "en"): string {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat(localeCode(locale), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export function formatDate(value: string, locale: Locale = "en"): string {
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat(localeCode(locale), {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
