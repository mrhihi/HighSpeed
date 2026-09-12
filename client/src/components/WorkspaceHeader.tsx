import { DataFreshnessNote } from "./DataFreshnessNote";
import { WorkspaceTabs } from "./WorkspaceTabs";

interface WorkspaceHeaderProps {
  active: "search" | "planner";
  onChange: (tab: "search" | "planner") => void;
}

export function WorkspaceHeader({ active, onChange }: WorkspaceHeaderProps) {
  return (
    <div className="workspace-sticky-header">
      <WorkspaceTabs active={active} onChange={onChange} />
      <DataFreshnessNote />
    </div>
  );
}
