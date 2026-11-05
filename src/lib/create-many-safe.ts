/** SQLite/D1 does not support createMany({ skipDuplicates: true }). */
export async function createManyIgnoreDuplicates(
  createMany: (args: { data: unknown[] }) => Promise<unknown>,
  createOne: (args: { data: unknown }) => Promise<unknown>,
  data: unknown[],
) {
  if (!data.length) return;
  try {
    await createMany({ data });
  } catch {
    for (const row of data) {
      try {
        await createOne({ data: row });
      } catch {
        /* unique / conflict — ignore */
      }
    }
  }
}
