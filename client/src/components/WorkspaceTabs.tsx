interface WorkspaceTabsProps {
  active: "search" | "planner";
  onChange: (tab: "search" | "planner") => void;
}

export function WorkspaceTabs({ active, onChange }: WorkspaceTabsProps) {
  return (
    <div className="workspace-tabs" role="tablist" aria-label="功能模式">
      <button
        type="button"
        role="tab"
        aria-selected={active === "search"}
        className={active === "search" ? "workspace-tab active" : "workspace-tab"}
        onClick={() => onChange("search")}
      >
        純查詢
        <span>查看原始座位狀態</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "planner"}
        className={active === "planner" ? "workspace-tab active" : "workspace-tab"}
        onClick={() => onChange("planner")}
      >
        購票建議
        <span>尋找分段購票方案</span>
      </button>
    </div>
  );
}
