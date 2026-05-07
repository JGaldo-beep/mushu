import { useMemo } from "react";
import { useHistoryContext } from "@/context/HistoryContext";
import type { HistoryItem } from "@/lib/types";

function wordCount(text: string) {
  return text.split(/\s+/).filter(Boolean).length;
}

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function isYesterday(iso: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return new Date(iso).toDateString() === yesterday.toDateString();
}

function isThisWeek(iso: string) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return new Date(iso) >= start;
}

function isLastWeek(iso: string) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() - 7);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const d = new Date(iso);
  return d >= start && d <= end;
}

interface SegmentMetrics {
  items: HistoryItem[];
  minutes: number;
  words: number;
}

function aggregate(items: HistoryItem[], filter: (iso: string) => boolean): SegmentMetrics {
  const filtered = items.filter((i) => filter(i.timestamp));
  const minutes = filtered.reduce((a, i) => a + i.duration_ms / 60000, 0);
  const words = filtered.reduce((a, i) => a + wordCount(i.processed_text), 0);
  return { items: filtered, minutes, words };
}

export interface HomeMetrics {
  /** Words spoken today (raw integer). */
  wordsToday: number;
  wordsTodayDelta: number | null;
  /** Words spoken in the last 7 days. */
  wordsWeek: number;
  wordsWeekDelta: number | null;
  /** Minutes spoken in the last 7 days (rounded to 1 decimal as a string). */
  minutesWeek: string;
  minutesWeekDelta: number | null;
  /** Average words-per-minute over today's sessions. "--" when not enough data. */
  velocityToday: string;
  velocityTodayDelta: number | null;
}

/** Aggregates the four hero metrics shown on Home. Source: HistoryContext. */
export function useHomeMetrics(): HomeMetrics {
  const { items } = useHistoryContext();

  return useMemo(() => {
    const today = aggregate(items, isToday);
    const yesterday = aggregate(items, isYesterday);
    const week = aggregate(items, isThisWeek);
    const lastWeek = aggregate(items, isLastWeek);

    const velToday = today.minutes > 0.1 ? Math.round(today.words / today.minutes) : null;
    const velYesterday =
      yesterday.minutes > 0.1 ? Math.round(yesterday.words / yesterday.minutes) : null;

    return {
      wordsToday: today.words,
      wordsTodayDelta:
        today.words > 0 || yesterday.words > 0 ? today.words - yesterday.words : null,

      wordsWeek: week.words,
      wordsWeekDelta:
        week.words > 0 || lastWeek.words > 0 ? week.words - lastWeek.words : null,

      minutesWeek: week.minutes.toFixed(1),
      minutesWeekDelta:
        week.minutes > 0 || lastWeek.minutes > 0
          ? +(week.minutes - lastWeek.minutes).toFixed(1)
          : null,

      velocityToday: velToday !== null ? velToday.toString() : "--",
      velocityTodayDelta:
        velToday !== null && velYesterday !== null ? velToday - velYesterday : null,
    };
  }, [items]);
}
