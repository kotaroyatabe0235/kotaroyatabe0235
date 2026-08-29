"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  PlusCircle,
  PieChart as PieChartIcon,
  Target,
  TrendingUp,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Users,
  Loader2,
  AlertTriangle,
  Download,
  Upload,
  CreditCard,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { storage } from "@/lib/storage";

/* ---------- design tokens ---------- */
const COLORS = {
  ink: "#1B3A5C",
  inkDark: "#12253A",
  paper: "#E9E1C6",
  paperLine: "rgba(27,58,92,0.16)",
  card: "#F6F1DF",
  shu: "#AE3A2A",
  shuSoft: "#D9614F",
  gold: "#C89B3C",
  pine: "#2E6B4F",
  ivory: "#FBF8EE",
  muted: "#6B6858",
};

const SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
const SANS =
  '"Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", sans-serif';

// seed data only — the user can add/remove categories from the 予算 tab,
// and the 入力/集計 views follow whatever categories currently exist.
const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "食費", color: "#B85C38" },
  { name: "住居費", color: "#1B3A5C" },
  { name: "水道光熱費", color: "#2E6B4F" },
  { name: "通信費", color: "#5C8AA6" },
  { name: "交通費", color: "#8E6C88" },
  { name: "日用品", color: "#C89B3C" },
  { name: "医療費", color: "#6B8E7F" },
  { name: "娯楽・趣味", color: "#A64B6B" },
  { name: "被服費", color: "#6B5B95" },
  { name: "教育費", color: "#3D5A80" },
  { name: "その他", color: "#8C8977" },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: "給与", color: "#1F5B4E" },
  { name: "副業", color: "#8E6C3E" },
  { name: "その他収入", color: "#8C8977" },
];

const CATEGORY_PALETTE = [
  "#B85C38", "#1B3A5C", "#2E6B4F", "#5C8AA6", "#8E6C88",
  "#C89B3C", "#6B8E7F", "#A64B6B", "#6B5B95", "#3D5A80",
  "#8C8977", "#1F5B4E", "#8E6C3E", "#7A4B3A",
];
const FALLBACK_CATEGORY_COLOR = "#9A9683";
const nextCategoryColor = (existingCount) =>
  CATEGORY_PALETTE[existingCount % CATEGORY_PALETTE.length];

const PAYMENT_METHODS = ["現金", "クレジットカード", "口座振替", "電子マネー", "その他"];
const PAYMENT_SHORT = {
  現金: "現金",
  クレジットカード: "カード",
  口座振替: "口座振替",
  電子マネー: "電子マネー",
  その他: "その他",
};
const paymentShort = (pm) => PAYMENT_SHORT[pm] || pm || "現金";

const emptyBudgets = () => ({ expense: {}, income: {} });

// Given the stored { byMonth: { [ym]: {expense, income} } } budgets object and the
// currently selected month, find the effective budget: the nearest saved month at
// or before `ym`, falling back to the legacy pre-migration budget (__base__), or empty.
const resolveBudgetsForMonth = (byMonth, ym) => {
  const explicitMonths = Object.keys(byMonth || {})
    .filter((k) => k !== "__base__" && k <= ym)
    .sort();
  if (explicitMonths.length > 0) {
    const source = explicitMonths[explicitMonths.length - 1];
    return { value: byMonth[source], source, inherited: source !== ym };
  }
  if (byMonth && byMonth.__base__) {
    return { value: byMonth.__base__, source: "__base__", inherited: true };
  }
  return { value: emptyBudgets(), source: null, inherited: false };
};

// Normalize a raw parsed budgets value (from KV or an imported export file) into
// the { byMonth: {...} } shape, wrapping older formats as the __base__ fallback.
const normalizeBudgets = (parsed) => {
  if (parsed && typeof parsed === "object") {
    if (parsed.byMonth && typeof parsed.byMonth === "object") {
      return { byMonth: parsed.byMonth };
    }
    if (parsed.expense && typeof parsed.expense === "object") {
      // pre-monthly format: a single global { expense, income } budget
      return { byMonth: { __base__: { expense: parsed.expense || {}, income: parsed.income || {} } } };
    }
    // legacy format: a flat {category: amount} map for expenses only
    return { byMonth: { __base__: { expense: parsed, income: {} } } };
  }
  return { byMonth: {} };
};

/* ---------- helpers ---------- */
const todayStr = () => new Date().toISOString().slice(0, 10);
const currentYM = () => new Date().toISOString().slice(0, 7);
const monthKey = (d) => (d || "").slice(0, 7);
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const yen = (n) => `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m, 10)}月`;
};
const shortMonthLabel = (ym) => `${parseInt(ym.split("-")[1], 10)}月`;
const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const last6Months = (ym) => {
  const arr = [];
  for (let i = 5; i >= 0; i--) arr.push(shiftMonth(ym, -i));
  return arr;
};
const totalsToMap = (arr) => Object.fromEntries(arr.map((c) => [c.name, c.value]));
const sumValues = (obj) => Object.values(obj).reduce((s, v) => s + (parseFloat(v) || 0), 0);

/* ---------- small UI pieces ---------- */
function StampBadge({ status }) {
  const config = {
    over: { color: COLORS.shu, label: "超過", rotate: -6 },
    ok: { color: COLORS.pine, label: "順調", rotate: -4 },
    achieved: { color: COLORS.pine, label: "達成", rotate: -5 },
  }[status];
  if (!config) return null;
  return (
    <span
      className="inline-flex items-center justify-center text-xs font-bold px-2 py-0.5 rounded-full border-2 select-none"
      style={{
        color: config.color,
        borderColor: config.color,
        transform: `rotate(${config.rotate}deg)`,
        fontFamily: SERIF,
        letterSpacing: "0.05em",
      }}
    >
      {config.label}
    </span>
  );
}

function TabButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
      style={{
        color: active ? COLORS.ink : "#B9AF8E",
        borderBottom: active ? `3px solid ${COLORS.shu}` : "3px solid transparent",
        fontFamily: SANS,
      }}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

function StatCard({ label, value, tone, sub }) {
  const color =
    tone === "shu" ? COLORS.shu : tone === "pine" ? COLORS.pine : COLORS.ink;
  return (
    <div
      className="flex-1 rounded-md px-3 py-3"
      style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}
    >
      <div className="text-xs mb-1" style={{ color: COLORS.muted, fontFamily: SANS }}>
        {label}
      </div>
      <div className="text-lg font-bold tabular-nums" style={{ color, fontFamily: SANS }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-0.5 truncate" style={{ color: COLORS.muted }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-10 text-sm" style={{ color: COLORS.muted, fontFamily: SANS }}>
      {text}
    </div>
  );
}

// A row showing a category's actual amount, and (if a budget/target is set)
// a progress bar comparing it against that budget/target.
function CategoryProgressRow({ name, dotColor, actual, target, mode, percentOfTotal }) {
  const ratio = target > 0 ? actual / target : 0;
  const status =
    target > 0
      ? mode === "expense"
        ? ratio >= 1
          ? "over"
          : actual > 0
          ? "ok"
          : null
        : ratio >= 1
        ? "achieved"
        : null
      : null;
  const fillColor =
    mode === "expense" ? (ratio >= 1 ? COLORS.shu : COLORS.gold) : ratio >= 1 ? COLORS.pine : COLORS.gold;
  return (
    <div className="px-3 py-2 rounded-md" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: dotColor }} />
          <span className="text-sm truncate" style={{ color: COLORS.ink }}>{name}</span>
          <StampBadge status={status} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {percentOfTotal != null && (
            <span className="text-xs" style={{ color: COLORS.muted }}>{percentOfTotal}</span>
          )}
          <span className="text-sm font-bold tabular-nums" style={{ color: COLORS.ink }}>{yen(actual)}</span>
        </div>
      </div>
      {target > 0 && (
        <>
          <div className="w-full h-1.5 rounded-full overflow-hidden mt-1.5" style={{ background: "rgba(27,58,92,0.12)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: fillColor }} />
          </div>
          <div className="text-xs tabular-nums mt-1" style={{ color: COLORS.muted }}>
            {mode === "expense" ? "予算" : "目標"} {yen(target)}
          </div>
        </>
      )}
    </div>
  );
}

// Category management + budget/target editing for one type ("expense" or "income").
function BudgetSection({
  type, title, hint, categoryList, actualMap, savedTargets, draft, onDraftChange,
  newName, onNewNameChange, onAdd, onRemove, error,
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-bold" style={{ color: COLORS.ink, fontFamily: SERIF }}>{title}</h3>
      <p className="text-xs" style={{ color: COLORS.muted }}>{hint}</p>

      <div className="rounded-md p-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
        <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>カテゴリを追加</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onAdd()}
            placeholder={type === "expense" ? "例：ペット、お小遣い" : "例：ボーナス、配当"}
            className="flex-1 px-2 py-1.5 rounded text-sm bg-transparent outline-none"
            style={{ color: COLORS.ink, border: `1px solid ${COLORS.paperLine}` }}
          />
          <button
            onClick={onAdd}
            disabled={!newName.trim()}
            className="px-4 rounded-md text-sm font-bold disabled:opacity-40"
            style={{ background: COLORS.ink, color: COLORS.ivory }}
          >
            追加
          </button>
        </div>
        {error && <p className="text-xs mt-1.5" style={{ color: COLORS.shu }}>{error}</p>}
      </div>

      {categoryList.length === 0 ? (
        <EmptyState text="まだカテゴリがありません。上から追加しましょう。" />
      ) : (
        categoryList.map((c) => {
          const actual = actualMap[c.name] || 0;
          const target = savedTargets[c.name] || 0;
          const ratio = target > 0 ? actual / target : 0;
          const status =
            target > 0
              ? type === "expense"
                ? ratio >= 1
                  ? "over"
                  : actual > 0
                  ? "ok"
                  : null
                : ratio >= 1
                ? "achieved"
                : null
              : null;
          const fillColor =
            type === "expense" ? (ratio >= 1 ? COLORS.shu : COLORS.gold) : ratio >= 1 ? COLORS.pine : COLORS.gold;
          return (
            <div key={c.name} className="rounded-md p-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
              <div className="flex items-center justify-between mb-2 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="text-sm font-semibold truncate" style={{ color: COLORS.ink }}>{c.name}</span>
                  <StampBadge status={status} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{ color: COLORS.muted }}>¥</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={draft[c.name] ?? ""}
                      onChange={(e) => onDraftChange(c.name, e.target.value)}
                      placeholder="未設定"
                      className="w-20 text-right text-sm bg-transparent outline-none tabular-nums"
                      style={{ color: COLORS.ink, borderBottom: `1px solid ${COLORS.paperLine}` }}
                    />
                  </div>
                  <button onClick={() => onRemove(c.name)} style={{ color: COLORS.muted }} aria-label={`${c.name}を削除`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {target > 0 && (
                <>
                  <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(27,58,92,0.12)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, background: fillColor }} />
                  </div>
                  <div className="flex justify-between mt-1 text-xs tabular-nums" style={{ color: COLORS.muted }}>
                    <span>{yen(actual)} {type === "expense" ? "使用" : "実績"}</span>
                    <span>{type === "expense" ? "予算" : "目標"} {yen(target)}</span>
                  </div>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------- main app ---------- */
export default function KakeiboApp() {
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState({ byMonth: {} });
  const [budgetDraft, setBudgetDraft] = useState(emptyBudgets());
  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [newExpenseCategoryName, setNewExpenseCategoryName] = useState("");
  const [newIncomeCategoryName, setNewIncomeCategoryName] = useState("");
  const [expenseCategoryError, setExpenseCategoryError] = useState("");
  const [incomeCategoryError, setIncomeCategoryError] = useState("");
  const [activeTab, setActiveTab] = useState("add");
  const [selectedMonth, setSelectedMonth] = useState(currentYM());
  const [pendingImport, setPendingImport] = useState(null);
  const [importError, setImportError] = useState("");

  // add-transaction form state
  const [formType, setFormType] = useState("expense");
  const [formAmount, setFormAmount] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDate, setFormDate] = useState(todayStr());
  const [formMemo, setFormMemo] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("現金");
  const [formBillingDate, setFormBillingDate] = useState("");

  useEffect(() => {
    (async () => {
      let tx = [];
      let bg = { byMonth: {} };
      let cats = null;
      try {
        const r = await storage.get("kakeibo:transactions");
        if (r?.value) tx = JSON.parse(r.value);
      } catch (e) {
        // key not found yet — start empty
      }
      try {
        const r = await storage.get("kakeibo:budgets");
        if (r?.value) bg = normalizeBudgets(JSON.parse(r.value));
      } catch (e) {
        // key not found yet — start empty
      }
      try {
        const r = await storage.get("kakeibo:categories");
        if (r?.value) cats = JSON.parse(r.value);
      } catch (e) {
        // key not found yet — seed with defaults below
      }
      setTransactions(Array.isArray(tx) ? tx : []);
      setBudgets(bg);
      if (cats && Array.isArray(cats.expense) && Array.isArray(cats.income)) {
        setCategories(cats);
      } else {
        setCategories({ expense: DEFAULT_EXPENSE_CATEGORIES, income: DEFAULT_INCOME_CATEGORIES });
      }
      setLoading(false);
    })();
  }, []);

  // The budget that actually applies to the selected month: either saved
  // explicitly for that month, or carried over from the nearest earlier month.
  const effectiveBudgets = useMemo(
    () => resolveBudgetsForMonth(budgets.byMonth, selectedMonth),
    [budgets, selectedMonth]
  );

  // Preset the budget editing form with the effective (possibly carried-over)
  // amounts whenever the selected month changes or budgets finish loading.
  useEffect(() => {
    setBudgetDraft(effectiveBudgets.value);
  }, [effectiveBudgets]);

  const persistTransactions = useCallback(async (next) => {
    setTransactions(next);
    try {
      const ok = await storage.set("kakeibo:transactions", JSON.stringify(next));
      if (!ok) setSaveError("保存に失敗しました。もう一度お試しください。");
      else setSaveError("");
    } catch (e) {
      setSaveError("保存に失敗しました。もう一度お試しください。");
    }
  }, []);

  const persistBudgets = useCallback(async (next) => {
    setBudgets(next);
    try {
      const ok = await storage.set("kakeibo:budgets", JSON.stringify(next));
      if (!ok) setSaveError("予算の保存に失敗しました。");
      else setSaveError("");
    } catch (e) {
      setSaveError("予算の保存に失敗しました。");
    }
  }, []);

  const persistCategories = useCallback(async (next) => {
    setCategories(next);
    try {
      const ok = await storage.set("kakeibo:categories", JSON.stringify(next));
      if (!ok) setSaveError("カテゴリの保存に失敗しました。");
      else setSaveError("");
    } catch (e) {
      setSaveError("カテゴリの保存に失敗しました。");
    }
  }, []);

  const handleAddCategory = (type) => {
    const raw = type === "expense" ? newExpenseCategoryName : newIncomeCategoryName;
    const name = raw.trim();
    const setError = type === "expense" ? setExpenseCategoryError : setIncomeCategoryError;
    if (!name) return;
    if (categories[type].some((c) => c.name === name)) {
      setError("同じ名前のカテゴリがすでにあります。");
      return;
    }
    setError("");
    const entry = { name, color: nextCategoryColor(categories[type].length) };
    persistCategories({ ...categories, [type]: [...categories[type], entry] });
    (type === "expense" ? setNewExpenseCategoryName : setNewIncomeCategoryName)("");
  };

  const handleRemoveCategory = (type, name) => {
    persistCategories({ ...categories, [type]: categories[type].filter((c) => c.name !== name) });
    const nextByMonth = {};
    let changed = false;
    Object.entries(budgets.byMonth).forEach(([ym, entry]) => {
      if (name in (entry[type] || {})) {
        changed = true;
        const nextTypeMap = { ...entry[type] };
        delete nextTypeMap[name];
        nextByMonth[ym] = { ...entry, [type]: nextTypeMap };
      } else {
        nextByMonth[ym] = entry;
      }
    });
    if (changed) persistBudgets({ byMonth: nextByMonth });
    if (name in budgetDraft[type]) {
      setBudgetDraft((d) => {
        const nextTypeDraft = { ...d[type] };
        delete nextTypeDraft[name];
        return { ...d, [type]: nextTypeDraft };
      });
    }
  };

  const handleAdd = () => {
    const amt = parseFloat(formAmount);
    if (!amt || amt <= 0 || !formDate || !formCategory) return;
    const entry = {
      id: uid(),
      type: formType,
      amount: amt,
      category: formCategory,
      date: formDate,
      memo: formMemo.trim(),
      paymentMethod: formPaymentMethod,
    };
    if (formPaymentMethod === "クレジットカード" && formBillingDate) {
      entry.billingDate = formBillingDate;
    }
    persistTransactions([entry, ...transactions]);
    setFormAmount("");
    setFormMemo("");
    setFormBillingDate("");
  };

  const handleDelete = (id) => {
    persistTransactions(transactions.filter((t) => t.id !== id));
  };

  const handleSaveBudgets = () => {
    const cleanSection = (section) => {
      const cleaned = {};
      Object.entries(section).forEach(([k, v]) => {
        const n = parseFloat(v);
        if (n > 0) cleaned[k] = n;
      });
      return cleaned;
    };
    persistBudgets({
      byMonth: {
        ...budgets.byMonth,
        [selectedMonth]: {
          expense: cleanSection(budgetDraft.expense),
          income: cleanSection(budgetDraft.income),
        },
      },
    });
  };

  const handleExport = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      transactions,
      budgets,
      categories,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kakeibo-export-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.transactions) || typeof parsed.budgets !== "object") {
          throw new Error("invalid shape");
        }
        setImportError("");
        setPendingImport(parsed);
      } catch (err) {
        setImportError("読み込めませんでした。エクスポートしたJSONファイルを選んでください。");
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    persistTransactions(pendingImport.transactions);
    const normalizedBudgets = normalizeBudgets(pendingImport.budgets);
    persistBudgets(normalizedBudgets);
    if (
      pendingImport.categories &&
      Array.isArray(pendingImport.categories.expense) &&
      Array.isArray(pendingImport.categories.income)
    ) {
      persistCategories(pendingImport.categories);
    }
    setPendingImport(null);
  };

  /* ---------- derived data ---------- */
  const monthTx = useMemo(
    () => transactions.filter((t) => monthKey(t.date) === selectedMonth),
    [transactions, selectedMonth]
  );
  const totalIncome = useMemo(
    () => monthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
    [monthTx]
  );
  const totalExpense = useMemo(
    () => monthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
    [monthTx]
  );
  const net = totalIncome - totalExpense;
  const cardTotal = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === "expense" && t.paymentMethod === "クレジットカード")
        .reduce((s, t) => s + t.amount, 0),
    [monthTx]
  );

  const categoryTotals = useMemo(() => {
    const map = {};
    monthTx.filter((t) => t.type === "expense").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const incomeCategoryTotals = useMemo(() => {
    const map = {};
    monthTx.filter((t) => t.type === "income").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTx]);

  const expenseCategoryMap = useMemo(() => totalsToMap(categoryTotals), [categoryTotals]);
  const incomeCategoryMap = useMemo(() => totalsToMap(incomeCategoryTotals), [incomeCategoryTotals]);
  const totalExpenseBudgetSum = useMemo(() => sumValues(effectiveBudgets.value.expense), [effectiveBudgets]);
  const totalIncomeTargetSum = useMemo(() => sumValues(effectiveBudgets.value.income), [effectiveBudgets]);

  const trendData = useMemo(() => {
    const months = last6Months(selectedMonth);
    return months.map((ym) => {
      const txs = transactions.filter((t) => monthKey(t.date) === ym);
      const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      return { ym, label: shortMonthLabel(ym), income, expense, net: income - expense };
    });
  }, [transactions, selectedMonth]);

  const recentTx = useMemo(() => transactions.slice(0, 10), [transactions]);

  const categoryColorMap = useMemo(() => {
    const map = {};
    [...categories.expense, ...categories.income].forEach((c) => {
      map[c.name] = c.color;
    });
    return map;
  }, [categories]);
  const colorFor = (name) => categoryColorMap[name] || FALLBACK_CATEGORY_COLOR;

  const formCategories = categories[formType] || [];

  useEffect(() => {
    if (!formCategories.find((c) => c.name === formCategory)) {
      setFormCategory(formCategories[0]?.name || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formType, categories]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.paper }}>
        <Loader2 className="animate-spin" size={28} style={{ color: COLORS.ink }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: COLORS.paper, fontFamily: SANS }}>
      {/* cover / header */}
      <div style={{ background: COLORS.inkDark }} className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-wide" style={{ color: COLORS.ivory, fontFamily: SERIF }}>
            家計簿
          </h1>
          <div
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
            style={{ color: "#D9CFA8", border: "1px solid rgba(217,207,168,0.4)" }}
          >
            <Users size={13} />
            家族と共有中
          </div>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 mb-1">
          <button onClick={() => setSelectedMonth((m) => shiftMonth(m, -1))} style={{ color: "#D9CFA8" }} aria-label="前の月">
            <ChevronLeft size={20} />
          </button>
          <span
            className="text-base font-semibold tabular-nums"
            style={{ color: COLORS.ivory, fontFamily: SERIF, minWidth: "7em", textAlign: "center" }}
          >
            {monthLabel(selectedMonth)}
          </span>
          <button onClick={() => setSelectedMonth((m) => shiftMonth(m, 1))} style={{ color: "#D9CFA8" }} aria-label="次の月">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex" style={{ background: COLORS.ivory, borderBottom: `1px solid ${COLORS.paperLine}` }}>
        <TabButton active={activeTab === "add"} onClick={() => setActiveTab("add")} icon={PlusCircle} label="入力" />
        <TabButton active={activeTab === "summary"} onClick={() => setActiveTab("summary")} icon={PieChartIcon} label="集計" />
        <TabButton active={activeTab === "budget"} onClick={() => setActiveTab("budget")} icon={Target} label="予算" />
        <TabButton active={activeTab === "trend"} onClick={() => setActiveTab("trend")} icon={TrendingUp} label="推移" />
      </div>

      <div className="flex items-center justify-end gap-4 px-4 py-1.5 text-xs" style={{ background: COLORS.ivory, borderBottom: `1px solid ${COLORS.paperLine}` }}>
        <button onClick={handleExport} className="flex items-center gap-1 font-semibold" style={{ color: COLORS.ink }}>
          <Download size={13} />
          エクスポート
        </button>
        <label className="flex items-center gap-1 font-semibold cursor-pointer" style={{ color: COLORS.ink }}>
          <Upload size={13} />
          インポート
          <input type="file" accept="application/json" onChange={handleImportFile} className="hidden" />
        </label>
      </div>

      {importError && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ background: "#F3DAD3", color: COLORS.shu }}>
          <AlertTriangle size={14} />
          {importError}
        </div>
      )}

      {pendingImport && (
        <div className="px-4 py-3" style={{ background: "#F3E8C9", borderBottom: `1px solid ${COLORS.paperLine}` }}>
          <p className="text-xs mb-2" style={{ color: COLORS.ink }}>
            {pendingImport.transactions.length}件の記録を読み込みます。現在のデータは上書きされます。よろしいですか？
          </p>
          <div className="flex gap-2">
            <button onClick={confirmImport} className="text-xs font-bold px-3 py-1.5 rounded-md" style={{ background: COLORS.ink, color: COLORS.ivory }}>
              読み込む
            </button>
            <button onClick={() => setPendingImport(null)} className="text-xs font-bold px-3 py-1.5 rounded-md" style={{ background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.ink}` }}>
              キャンセル
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ background: "#F3DAD3", color: COLORS.shu }}>
          <AlertTriangle size={14} />
          {saveError}
        </div>
      )}

      {/* content, ledger-ruled background */}
      <div
        className="px-4 py-5 pb-12"
        style={{
          backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 39px, ${COLORS.paperLine} 39px, ${COLORS.paperLine} 40px)`,
        }}
      >
        {activeTab === "add" && (
          <div className="space-y-4">
            <div className="rounded-md p-4" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
              <div className="flex rounded-md overflow-hidden mb-4" style={{ border: `1px solid ${COLORS.ink}` }}>
                {[
                  { key: "expense", label: "支出" },
                  { key: "income", label: "収入" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFormType(opt.key)}
                    className="flex-1 py-2 text-sm font-bold"
                    style={{
                      background: formType === opt.key ? (opt.key === "expense" ? COLORS.shu : COLORS.pine) : "transparent",
                      color: formType === opt.key ? COLORS.ivory : COLORS.ink,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>金額</label>
              <div className="flex items-center gap-1 mb-4">
                <span className="text-xl font-bold" style={{ color: COLORS.ink, fontFamily: SERIF }}>¥</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 text-xl font-bold bg-transparent outline-none tabular-nums"
                  style={{ color: COLORS.ink, borderBottom: `2px solid ${COLORS.ink}` }}
                />
              </div>

              <label className="text-xs font-semibold block mb-2" style={{ color: COLORS.muted }}>カテゴリ</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {formCategories.length === 0 ? (
                  <p className="text-xs" style={{ color: COLORS.muted }}>カテゴリがまだありません。「予算」タブから追加してください。</p>
                ) : (
                  formCategories.map((c) => {
                    const selected = formCategory === c.name;
                    return (
                      <button
                        key={c.name}
                        onClick={() => setFormCategory(c.name)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full"
                        style={{
                          background: selected ? c.color : "transparent",
                          color: selected ? COLORS.ivory : COLORS.ink,
                          border: `1.5px solid ${c.color}`,
                        }}
                      >
                        {c.name}
                      </button>
                    );
                  })
                )}
              </div>

              <label className="text-xs font-semibold block mb-2" style={{ color: COLORS.muted }}>支払い方法</label>
              <div className="flex flex-wrap gap-2 mb-4">
                {PAYMENT_METHODS.map((pm) => {
                  const selected = formPaymentMethod === pm;
                  return (
                    <button
                      key={pm}
                      onClick={() => setFormPaymentMethod(pm)}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                      style={{
                        background: selected ? COLORS.ink : "transparent",
                        color: selected ? COLORS.ivory : COLORS.ink,
                        border: `1.5px solid ${COLORS.ink}`,
                      }}
                    >
                      {pm === "クレジットカード" && <CreditCard size={12} />}
                      {pm}
                    </button>
                  );
                })}
              </div>

              {formPaymentMethod === "クレジットカード" && (
                <>
                  <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>引き落とし予定日（任意）</label>
                  <input
                    type="date"
                    value={formBillingDate}
                    onChange={(e) => setFormBillingDate(e.target.value)}
                    className="w-full mb-4 px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                    style={{ color: COLORS.ink, border: `1px solid ${COLORS.paperLine}` }}
                  />
                </>
              )}

              <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>日付</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full mb-4 px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                style={{ color: COLORS.ink, border: `1px solid ${COLORS.paperLine}` }}
              />

              <label className="text-xs font-semibold block mb-1" style={{ color: COLORS.muted }}>メモ（任意）</label>
              <input
                type="text"
                value={formMemo}
                onChange={(e) => setFormMemo(e.target.value)}
                placeholder="例：スーパーで買い出し"
                className="w-full mb-4 px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                style={{ color: COLORS.ink, border: `1px solid ${COLORS.paperLine}` }}
              />

              <button
                onClick={handleAdd}
                disabled={!formAmount || parseFloat(formAmount) <= 0 || !formCategory}
                className="w-full py-2.5 rounded-md font-bold text-sm disabled:opacity-40"
                style={{ background: COLORS.ink, color: COLORS.ivory }}
              >
                記録する
              </button>
            </div>

            <div>
              <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.ink, fontFamily: SERIF }}>最近の記録</h3>
              {recentTx.length === 0 ? (
                <EmptyState text="まだ記録がありません。最初の一件を入力しましょう。" />
              ) : (
                <div className="space-y-1.5">
                  {recentTx.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0" style={{ background: colorFor(t.category), color: COLORS.ivory }}>
                          {t.category}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs truncate flex items-center gap-1" style={{ color: COLORS.muted }}>
                            {t.date} ・
                            {t.paymentMethod === "クレジットカード" && <CreditCard size={11} />}
                            {paymentShort(t.paymentMethod || "現金")}
                            {t.memo ? ` ・ ${t.memo}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-bold tabular-nums" style={{ color: t.type === "expense" ? COLORS.shu : COLORS.pine }}>
                          {t.type === "expense" ? "-" : "+"}{yen(t.amount)}
                        </span>
                        <button onClick={() => handleDelete(t.id)} style={{ color: COLORS.muted }} aria-label="削除">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "summary" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <StatCard label="収入" value={yen(totalIncome)} tone="pine" />
              <StatCard label="支出" value={yen(totalExpense)} tone="shu" sub={cardTotal > 0 ? `うちカード ${yen(cardTotal)}` : undefined} />
              <StatCard label="収支" value={`${net >= 0 ? "+" : ""}${yen(net)}`} tone={net >= 0 ? "pine" : "shu"} />
            </div>

            {(totalExpenseBudgetSum > 0 || totalIncomeTargetSum > 0) && (
              <div className="rounded-md p-3 space-y-3" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
                <h3 className="text-sm font-bold" style={{ color: COLORS.ink, fontFamily: SERIF }}>予算の達成状況</h3>
                {totalExpenseBudgetSum > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1" style={{ color: COLORS.muted }}>
                      <span>支出予算</span>
                      <StampBadge status={totalExpense / totalExpenseBudgetSum >= 1 ? "over" : totalExpense > 0 ? "ok" : null} />
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(27,58,92,0.12)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(totalExpense / totalExpenseBudgetSum, 1) * 100}%`,
                          background: totalExpense / totalExpenseBudgetSum >= 1 ? COLORS.shu : COLORS.gold,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs tabular-nums" style={{ color: COLORS.muted }}>
                      <span>{yen(totalExpense)} 使用</span>
                      <span>予算合計 {yen(totalExpenseBudgetSum)}</span>
                    </div>
                  </div>
                )}
                {totalIncomeTargetSum > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1" style={{ color: COLORS.muted }}>
                      <span>収入目標</span>
                      <StampBadge status={totalIncome / totalIncomeTargetSum >= 1 ? "achieved" : null} />
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(27,58,92,0.12)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(totalIncome / totalIncomeTargetSum, 1) * 100}%`,
                          background: totalIncome / totalIncomeTargetSum >= 1 ? COLORS.pine : COLORS.gold,
                        }}
                      />
                    </div>
                    <div className="flex justify-between mt-1 text-xs tabular-nums" style={{ color: COLORS.muted }}>
                      <span>{yen(totalIncome)} 実績</span>
                      <span>目標合計 {yen(totalIncomeTargetSum)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {categoryTotals.length === 0 ? (
              <EmptyState text="この月の支出記録がまだありません。" />
            ) : (
              <>
                <div className="rounded-md p-2" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryTotals} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                        {categoryTotals.map((entry) => (
                          <Cell key={entry.name} fill={colorFor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => yen(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5">
                  {categoryTotals.map((c) => (
                    <CategoryProgressRow
                      key={c.name}
                      name={c.name}
                      dotColor={colorFor(c.name)}
                      actual={c.value}
                      target={effectiveBudgets.value.expense[c.name] || 0}
                      mode="expense"
                      percentOfTotal={totalExpense > 0 ? `${((c.value / totalExpense) * 100).toFixed(0)}%` : "0%"}
                    />
                  ))}
                </div>
              </>
            )}

            {incomeCategoryTotals.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-bold mt-2" style={{ color: COLORS.ink, fontFamily: SERIF }}>収入の内訳</h3>
                {incomeCategoryTotals.map((c) => (
                  <CategoryProgressRow
                    key={c.name}
                    name={c.name}
                    dotColor={colorFor(c.name)}
                    actual={c.value}
                    target={effectiveBudgets.value.income[c.name] || 0}
                    mode="income"
                    percentOfTotal={totalIncome > 0 ? `${((c.value / totalIncome) * 100).toFixed(0)}%` : "0%"}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "budget" && (
          <div className="space-y-6">
            {effectiveBudgets.source === null ? (
              <p className="text-xs" style={{ color: COLORS.muted }}>まだ予算が設定されていません。</p>
            ) : effectiveBudgets.inherited ? (
              <p className="text-xs" style={{ color: COLORS.muted }}>
                {effectiveBudgets.source === "__base__"
                  ? "以前設定した予算を引き継いでいます。"
                  : `${monthLabel(effectiveBudgets.source)}の予算を引き継いでいます。`}
                保存すると{monthLabel(selectedMonth)}専用の予算になります。
              </p>
            ) : (
              <p className="text-xs" style={{ color: COLORS.muted }}>{monthLabel(selectedMonth)}用に保存済みの予算です。</p>
            )}

            <BudgetSection
              type="expense"
              title="支出予算"
              hint="カテゴリを登録して、それぞれに今月の予算を設定できます。使いすぎると「超過」の印が付きます。"
              categoryList={categories.expense}
              actualMap={expenseCategoryMap}
              savedTargets={effectiveBudgets.value.expense}
              draft={budgetDraft.expense}
              onDraftChange={(name, val) => setBudgetDraft((d) => ({ ...d, expense: { ...d.expense, [name]: val } }))}
              newName={newExpenseCategoryName}
              onNewNameChange={setNewExpenseCategoryName}
              onAdd={() => handleAddCategory("expense")}
              onRemove={(name) => handleRemoveCategory("expense", name)}
              error={expenseCategoryError}
            />

            <BudgetSection
              type="income"
              title="収入目標"
              hint="カテゴリごとに今月の収入目標を設定して、実績と比べられます。達成すると「達成」の印が付きます。"
              categoryList={categories.income}
              actualMap={incomeCategoryMap}
              savedTargets={effectiveBudgets.value.income}
              draft={budgetDraft.income}
              onDraftChange={(name, val) => setBudgetDraft((d) => ({ ...d, income: { ...d.income, [name]: val } }))}
              newName={newIncomeCategoryName}
              onNewNameChange={setNewIncomeCategoryName}
              onAdd={() => handleAddCategory("income")}
              onRemove={(name) => handleRemoveCategory("income", name)}
              error={incomeCategoryError}
            />

            {(categories.expense.length > 0 || categories.income.length > 0) && (
              <button onClick={handleSaveBudgets} className="w-full py-2.5 rounded-md font-bold text-sm" style={{ background: COLORS.ink, color: COLORS.ivory }}>
                予算を保存
              </button>
            )}
          </div>
        )}

        {activeTab === "trend" && (
          <div className="space-y-4">
            <div className="rounded-md p-2" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.paperLine} vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 12 }} axisLine={{ stroke: COLORS.paperLine }} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v) => yen(v)} />
                  <Bar dataKey="income" name="収入" fill={COLORS.pine} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expense" name="支出" fill={COLORS.shu} radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="net" name="収支" stroke={COLORS.gold} strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5">
              {trendData.map((m) => (
                <div key={m.ym} className="flex items-center justify-between px-3 py-2 rounded-md" style={{ background: COLORS.card, border: `1px solid ${COLORS.paperLine}` }}>
                  <span className="text-sm font-semibold" style={{ color: COLORS.ink, fontFamily: SERIF }}>{monthLabel(m.ym)}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: m.net >= 0 ? COLORS.pine : COLORS.shu }}>
                    {m.net >= 0 ? "+" : ""}{yen(m.net)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
