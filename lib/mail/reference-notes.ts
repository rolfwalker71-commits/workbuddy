export type ReferenceNote = {
  id: number;
  userId: number;
  title: string;
  body: string | null;
  reference: string | null;
  sourceMessageId: string | null;
  triliumNoteId: string | null;
  createdAt: string;
};

export function listRecentReferenceNotes(
  _userId: number,
  _limit = 12
): ReferenceNote[] {
  return [];
}

export async function createReferenceNote(input: {
  userId: number;
  title: string;
  body?: string | null;
  reference?: string | null;
  sourceMessageId?: string | null;
}): Promise<ReferenceNote> {
  return {
    id: 0,
    userId: input.userId,
    title: input.title,
    body: input.body ?? null,
    reference: input.reference ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    triliumNoteId: null,
    createdAt: new Date().toISOString(),
  };
}
