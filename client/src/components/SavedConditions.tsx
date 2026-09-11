import { useEffect, useRef, useState, type MouseEvent } from "react";

interface SavedCondition<T> {
  id: string;
  name: string;
  value: T;
}

interface SavedConditionsProps<T> {
  storageKey: string;
  value: T;
  onLoad: (value: T) => void;
  onLoadWithToday?: (value: T) => void;
  onClear?: () => void;
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

export function SavedConditions<T>({ storageKey, value, onLoad, onLoadWithToday, onClear, label, compact = false }: SavedConditionsProps<T>) {
  const [items, setItems] = useState<SavedCondition<T>[]>(() => readSaved<T>(storageKey));
  const [selectedId, setSelectedId] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [conditionDialog, setConditionDialog] = useState<"save" | "rename" | null>(null);
  const [saveName, setSaveName] = useState("");
  const [openMenu, setOpenMenu] = useState<"conditions" | "clipboard" | null>(null);
  const [hoveredMenu, setHoveredMenu] = useState<"conditions" | "clipboard" | null>(null);
  const saveDialogRef = useRef<HTMLDialogElement>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  const showFeedback = (message: string, duration = 1600) => {
    setCopyMessage(message);
    window.setTimeout(() => setCopyMessage(""), duration);
  };

  const closeMenuAnd = (action: () => void) => () => {
    setOpenMenu(null);
    setHoveredMenu(null);
    action();
  };

  const openMenuOnHover = (event: { currentTarget: HTMLElement }) => {
    const menu = event.currentTarget.dataset.menu as "conditions" | "clipboard" | undefined;
    if (menu) {
      setOpenMenu(null);
      setHoveredMenu(menu);
    }
  };

  const openMenuOnClick = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const menuId = event.currentTarget.dataset.menu as "conditions" | "clipboard" | undefined;
    if (menuId) {
      setHoveredMenu(null);
      setOpenMenu((current) => current === menuId ? null : menuId);
    }
  };

  const closeMenuOnLeave = () => {
    setOpenMenu(null);
    setHoveredMenu(null);
  };

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  useEffect(() => {
    const dialog = saveDialogRef.current;
    if (!dialog) return;
    if (conditionDialog && !dialog.open) dialog.showModal();
    if (!conditionDialog && dialog.open) dialog.close();
  }, [conditionDialog]);

  useEffect(() => {
    const handleOutsideClick = (event: PointerEvent) => {
      const container = menuContainerRef.current;
      if (!container || event.target instanceof Node && container.contains(event.target)) return;
      setOpenMenu(null);
      setHoveredMenu(null);
    };
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, []);

  const updateCurrent = () => {
    if (!selectedId) return;
    setItems((current) => current.map((item) => item.id === selectedId ? { ...item, value } : item));
    showFeedback("更新完成");
  };

  const saveAsNew = () => {
    setSaveName(`${label} ${items.length + 1}`);
    setConditionDialog("save");
  };

  const confirmSaveAsNew = () => {
    const name = saveName.trim();
    if (!name) return;
    const next = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, value };
    setItems((current) => [...current, next]);
    setSelectedId(next.id);
    setConditionDialog(null);
    showFeedback("另存完成");
  };

  const renameSelected = () => {
    const item = items.find((candidate) => candidate.id === selectedId);
    if (!item) return;
    setSaveName(item.name);
    setConditionDialog("rename");
  };

  const confirmRename = () => {
    const name = saveName.trim();
    if (!name || !selectedId) return;
    setItems((current) => current.map((candidate) => candidate.id === selectedId ? { ...candidate, name } : candidate));
    setConditionDialog(null);
    showFeedback("重新命名完成");
  };

  const copyCurrent = async () => {
    const content = JSON.stringify({ name: `${label}目前畫面`, value }, null, 2);
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
    showFeedback("複製完成");
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
      showFeedback("貼上並套用完成");
    } catch {
      showFeedback("剪貼簿不是有效的條件 JSON", 2200);
    }
  };

  const selectCondition = (id: string) => {
    setSelectedId(id);
    if (!id) {
      onClear?.();
      return;
    }
    const item = items.find((candidate) => candidate.id === id);
    if (item) onLoad(item.value);
  };

  const loadWithToday = () => {
    const item = items.find((candidate) => candidate.id === selectedId);
    if (!item || !onLoadWithToday) return;
    onLoadWithToday(item.value);
    showFeedback("帶入並套用今天完成");
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setItems((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId("");
    showFeedback("刪除完成");
  };

  return (
    <>
      <div ref={menuContainerRef} className={`saved-conditions${compact ? " saved-conditions-compact" : ""}`} aria-label={`${label}條件管理`}>
        <span className="saved-conditions-label">已儲存條件</span>
        <select value={selectedId} onChange={(event) => selectCondition(event.target.value)} aria-label={`選擇${label}條件`}>
          <option value="">請選擇</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div data-menu="conditions" data-open={openMenu === "conditions" || hoveredMenu === "conditions"} className="saved-condition-menu" onMouseEnter={openMenuOnHover} onMouseLeave={closeMenuOnLeave}>
          <button type="button" data-menu="conditions" className="saved-condition-menu-trigger" onClick={openMenuOnClick} aria-haspopup="menu" aria-expanded={openMenu === "conditions" || hoveredMenu === "conditions"}>條件操作</button>
          <div className="saved-condition-menu-popup">
            <button type="button" className="saved-condition-menu-item" onClick={closeMenuAnd(() => updateCurrent())} disabled={!selectedId}>更新</button>
            <button type="button" className="saved-condition-menu-item" onClick={closeMenuAnd(() => saveAsNew())}>另存</button>
            <button type="button" className="saved-condition-menu-item" onClick={closeMenuAnd(() => renameSelected())} disabled={!selectedId}>重新命名</button>
            <button type="button" className="saved-condition-menu-item saved-condition-menu-item-danger" onClick={closeMenuAnd(() => deleteSelected())} disabled={!selectedId}>刪除</button>
          </div>
        </div>
        <div data-menu="clipboard" data-open={openMenu === "clipboard" || hoveredMenu === "clipboard"} className="saved-condition-menu" onMouseEnter={openMenuOnHover} onMouseLeave={closeMenuOnLeave}>
          <button type="button" data-menu="clipboard" className="saved-condition-menu-trigger" onClick={openMenuOnClick} aria-haspopup="menu" aria-expanded={openMenu === "clipboard" || hoveredMenu === "clipboard"}>剪貼簿</button>
          <div className="saved-condition-menu-popup">
            <button type="button" className="saved-condition-menu-item" onClick={closeMenuAnd(() => copyCurrent())}>複製目前條件到剪貼簿</button>
            <button type="button" className="saved-condition-menu-item" onClick={closeMenuAnd(() => pasteCondition())}>從剪貼簿貼上</button>
          </div>
        </div>
        {onLoadWithToday && <button type="button" className="saved-condition-button" onClick={loadWithToday} disabled={!selectedId}>帶入並改為今天</button>}
        {copyMessage && <span className="saved-condition-feedback" role="status">{copyMessage}</span>}
      </div>
      <dialog
        ref={saveDialogRef}
        className="saved-condition-dialog"
        aria-labelledby="saved-condition-dialog-title"
        onCancel={() => setConditionDialog(null)}
      >
        <form onSubmit={(event) => { event.preventDefault(); conditionDialog === "rename" ? confirmRename() : confirmSaveAsNew(); }}>
          <h2 id="saved-condition-dialog-title">{conditionDialog === "rename" ? `重新命名${label}條件` : `另存${label}條件`}</h2>
          <label className="field">
            <span>條件名稱</span>
            <input autoFocus value={saveName} onChange={(event) => setSaveName(event.target.value)} />
          </label>
          <div className="saved-condition-dialog-actions">
            <button type="button" className="saved-condition-button" onClick={() => setConditionDialog(null)}>取消</button>
            <button type="submit" className="saved-condition-button">{conditionDialog === "rename" ? "確認" : "儲存"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
