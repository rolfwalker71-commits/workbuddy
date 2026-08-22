export type MailSyncResult = {
  examined: number;
  skippedHeuristic: number;
  analyzed: number;
  withSuggestions: number;
  errors: number;
  pendingAi: number;
};
