/** Client-safe: keep the opened ticket until the user leaves detail / info. */

export type TicketQueueSelection = {
  selectedId: number | null;
  flyoutOpen: boolean;
  pinnedId: number | null;
};

export type TicketQueueSelectionInput = TicketQueueSelection & {
  poolIds: readonly number[];
  searching: boolean;
  listLoading: boolean;
};

/**
 * After the queue list refreshes, pick the next selection.
 * While the ticket flyout (Eingabe-/Infobereich) is open, never auto-advance
 * just because the ticket left the current filter (e.g. assignee change).
 * Auto-advance to the first remaining ticket only after the user leaves.
 */
export function nextTicketQueueSelection(
  input: TicketQueueSelectionInput
): TicketQueueSelection {
  const { selectedId, flyoutOpen, pinnedId, poolIds, searching, listLoading } =
    input;
  const inPool = selectedId != null && poolIds.includes(selectedId);

  if (flyoutOpen && selectedId != null) {
    return {
      selectedId,
      flyoutOpen: true,
      pinnedId: inPool && pinnedId === selectedId ? null : pinnedId,
    };
  }

  if (poolIds.length === 0) {
    if (searching) {
      return { selectedId: null, flyoutOpen: false, pinnedId };
    }
    if (!listLoading && pinnedId == null) {
      return { selectedId: null, flyoutOpen: false, pinnedId };
    }
    return { selectedId, flyoutOpen, pinnedId };
  }

  if (inPool) {
    return {
      selectedId,
      flyoutOpen,
      pinnedId: pinnedId === selectedId ? null : pinnedId,
    };
  }

  if (selectedId != null && selectedId === pinnedId) {
    return { selectedId, flyoutOpen, pinnedId };
  }

  return {
    selectedId: poolIds[0] ?? null,
    flyoutOpen,
    pinnedId,
  };
}
