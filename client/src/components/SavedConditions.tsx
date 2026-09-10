import { useEffect, useState } from "react";

interface SavedCondition<T> {
  id: string;
  name: string;
  value: T;
}

interface SavedConditionsProps<T> {
  storageKey: string;
  value: T;
  onLoad: (value: T) => void;
  label: string;
  compact?: boolean;
}

function readSaved<T>(storageKey: string): SavedCondition<T>[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as SavedCondition<T>[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.name && "value" in item) : [];
  } catch {
    return [];
  }
}

export function SavedConditions<T>({ storageKey, value, onLoad, label, compact = false }: SavedConditionsProps<T>) {
  const [items, setItems] = useState<SavedCondition<T>[]>(() => readSaved<T>(storageKey));
  const [selectedId, setSelectedId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  const updateCurrent = () => {
    if (!selectedId) return;
    setItems((current) => current.map((item) => item.id === selectedId ? { ...item, value } : item));
  };

  const saveAsNew = () => {
    const name = window.prompt(`請輸入${label}名稱`, `${label} ${items.length + 1}`)?.trim();
    if (!name) return;
    const next = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, value };
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
  };

  const copySelected = async () => {
    const item = items.find((candidate) => candidate.id === selectedId);
    if (!item) return;
    const content = JSON.stringify({ name: item.name, value: item.value }, null, 2);
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopyMessage("已複製");
    window.setTimeout(() => setCopyMessage(""), 1600);
  };

  const pasteCondition = async () => {
    try {
      const parsed = JSON.parse(await navigator.clipboard.readText()) as Partial<SavedCondition<T>>;
      if (!parsed || typeof parsed !== "object" || !parsed.value) throw new Error("invalid");
      const name = typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : window.prompt(`請輸入${label}名稱`, `${label} ${items.length + 1}`)?.trim();
      if (!name) return;
      const next = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, value: parsed.value as T };
      setItems((current) => [...current, next]);
      setSelectedId(next.id);
      onLoad(next.value);
      setCopyMessage("已貼上並套用");
      window.setTimeout(() => setCopyMessage(""), 1600);
    } catch {
      setCopyMessage("剪貼簿不是有效的條件 JSON");
      window.setTimeout(() => setCopyMessage(""), 2200);
    }
  };

  const selectCondition = (id: string) => {
    setSelectedId(id);
    const item = items.find((candidate) => candidate.id === id);
    if (item) onLoad(item.value);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId("");
  };

  const renameSelected = () => {
    const item = items.find((candidate) => candidate.id === selectedId);
    if (!item) return;
    const name = window.prompt("請輸入新的條件名稱", item.name)?.trim();
    if (!name) return;
    setItems((current) => current.map((candidate) => candidate.id === selectedId ? { ...candidate, name } : candidate));
  };

  return (
    <div className={`saved-conditions${compact ? " saved-conditions-compact" : ""}`} aria-label={`${label}條件管理`}>
      <span className="saved-conditions-label">已儲存條件</span>
      <select value={selectedId} onChange={(event) => selectCondition(event.target.value)} aria-label={`選擇${label}條件`}>
        <option value="">請選擇</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button type="button" className="saved-condition-button" onClick={updateCurrent} disabled={!selectedId}>更新</button>
      <button type="button" className="saved-condition-button" onClick={saveAsNew}>另存</button>
      <button type="button" className="saved-condition-button" onClick={renameSelected} disabled={!selectedId}>重新命名</button>
      <button type="button" className="saved-condition-button" onClick={copySelected} disabled={!selectedId}>複製到剪貼簿</button>
      <button type="button" className="saved-condition-button" onClick={pasteCondition}>從剪貼簿貼上</button>
      <button type="button" className="saved-condition-delete" onClick={deleteSelected} disabled={!selectedId}>刪除</button>
      {copyMessage && <span className="saved-condition-feedback" role="status">{copyMessage}</span>}
    </div>
  );
}
