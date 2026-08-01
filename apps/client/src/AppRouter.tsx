import App from './App';
import { WorkflowBriefPreviewPage } from './features/workflow-brief/WorkflowBriefPreviewPage';

export function AppRouter({ pathname = window.location.pathname }: { pathname?: string }) {
  return pathname === '/internal/workflow-brief' ? <WorkflowBriefPreviewPage /> : <App />;
}

