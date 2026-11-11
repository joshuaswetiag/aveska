import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { readEnv } from "@/lib/read-env";

/** Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD. Never resets an existing user. */
export async function ensureFirstAdmin() {
  if (await prisma.user.count()) return;
  const password = readEnv("ADMIN_PASSWORD")?.trim();
  if (!password || password === "change-me") return;
  const email = (readEnv("ADMIN_EMAIL") || "admin@aveska.local").trim().toLowerCase();
  const passwordHash = hashPassword(password);
  await prisma.user.create({
    data: { email, passwordHash, role: "ADMIN", name: "Aveska Admin" },
  });
  await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      shopUrl: "https://aveska.com.au",
      contactUrl: "https://aveska.com.au/contact",
      fromName: "Aveska",
      companyName: "Aveska",
    },
  });
}

export async function ensureAdminUser() {
  const email = (readEnv("ADMIN_EMAIL") || "admin@aveska.local").trim().toLowerCase();
  const password = readEnv("ADMIN_PASSWORD") || "change-me";
  const passwordHash = hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", name: "Aveska Admin" },
    create: { email, passwordHash, role: "ADMIN", name: "Aveska Admin" },
  });

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      shopUrl: "https://aveska.com.au",
      contactUrl: "https://aveska.com.au/contact",
      fromName: "Aveska",
      companyName: "Aveska",
    },
  });
}
