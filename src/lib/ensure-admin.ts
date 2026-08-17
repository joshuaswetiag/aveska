import { hash } from "bcryptjs";
import { prisma } from "@/lib/db";

export async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || "admin@aveska.local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "change-me";
  const passwordHash = await hash(password, 12);

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
