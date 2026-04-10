import { Hono } from "hono";
import { ProfileRoutes } from "@/constants/routes.ts";
import { loadProfile, supabaseAuth } from "@/middleware";
import { bootstrapProfile } from "@/services";

import type { AppContext } from "@/types";

const router = new Hono<AppContext>();

router.post(ProfileRoutes.BootstrapProfile, supabaseAuth, async (c) => {
  const userId = c.get("userId");

  const name = c.get("name");
  const email = c.get("email");

  const profile = await bootstrapProfile({ userId, name, email });
  return c.json(profile);
});

router.get(ProfileRoutes.Me, supabaseAuth, loadProfile, async (c) => {
  const profile = c.get("profile");
  const name = c.get("name");
  const email = c.get("email");

  return c.json({ ...profile, name, email }, 200);
});

export default router;
