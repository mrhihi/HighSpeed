interface LoadingErrorStateProps {
  loading: boolean;
  error?: string | null;
}

export function LoadingErrorState({ loading, error }: LoadingErrorStateProps) {
  if (loading) {
    return (
      <div className="status-message status-loading" role="status" aria-live="polite">
        <span className="loading-spinner" aria-hidden="true" />
        <span><strong>正在查詢票況</strong><small>正在整理車次與座位資料，請稍候…</small></span>
        <span className="loading-dots" aria-hidden="true">•••</span>
      </div>
    );
  }
  if (error) {
    return <p className="status-message status-error">{error}</p>;
  }
  return null;
}
