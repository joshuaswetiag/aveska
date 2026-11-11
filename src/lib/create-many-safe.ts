export function isUniqueConflict(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "P2002") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unique constraint failed|UNIQUE constraint failed/i.test(message);
}

/** SQLite/D1 does not support createMany({ skipDuplicates: true }). */
export async function createManyIgnoreDuplicates(
  createMany: (args: { data: unknown[] }) => Promise<unknown>,
  createOne: (args: { data: unknown }) => Promise<unknown>,
  data: unknown[],
) {
  if (!data.length) return { inserted: 0 };
  try {
    await createMany({ data });
    return { inserted: data.length };
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
  }
  let inserted = 0;
  for (const row of data) {
    try {
      await createOne({ data: row });
      inserted += 1;
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
  }
  return { inserted };
}
