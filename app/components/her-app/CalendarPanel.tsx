import type { MemoryCard } from "./types";
import { pad } from "./utils";
import styles from "../HerApp.module.css";

type CalendarPanelProps = {
  month: Date;
  cards: MemoryCard[];
  selectedDate: string;
  onSelect: (date: string) => void;
  onMonth: (date: Date) => void;
};

export function CalendarPanel({
  month,
  cards,
  selectedDate,
  onSelect,
  onMonth,
}: CalendarPanelProps) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= days ? day : null;
  });
  const counts = cards.reduce<Record<string, number>>((map, card) => {
    if (card.pinnedDate) {
      map[card.pinnedDate] = (map[card.pinnedDate] ?? 0) + 1;
    }
    return map;
  }, {});

  return (
    <article className={styles.calendarCard}>
      <div className={styles.calendarNav}>
        <button
          onClick={() => onMonth(new Date(year, monthIndex - 1, 1))}
          aria-label="上个月"
        >
          ‹
        </button>
        <h2>
          {month.toLocaleDateString("zh-CN", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <button
          onClick={() => onMonth(new Date(year, monthIndex + 1, 1))}
          aria-label="下个月"
        >
          ›
        </button>
      </div>
      <div className={styles.weekdays}>
        {["日", "一", "二", "三", "四", "五", "六"].map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>
      <div className={styles.calendarGrid}>
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} />;
          const key = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              className={selectedDate === key ? styles.daySelected : ""}
              onClick={() => onSelect(key)}
              aria-label={`${key}${count ? `，${count} 段记忆` : ""}`}
            >
              <span>{day}</span>
              {count > 0 && (
                <i>
                  {Array.from({ length: Math.min(3, count) }, (_, dot) => (
                    <b key={dot} />
                  ))}
                  {count > 3 && <small>+</small>}
                </i>
              )}
            </button>
          );
        })}
      </div>
      <p>
        {selectedDate
          ? `已固定 ${counts[selectedDate] ?? 0} 段记忆 · 选择日期可固定最新记忆`
          : "请选择日期"}
      </p>
    </article>
  );
}
