import { z } from "zod";
import { getFirebaseAuth, getFirebaseProjectId, getFirestoreDb } from "../firebase";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }))
    .query(() => ({ ok: true })),
  firebaseCheck: adminProcedure.query(async () => {
    const projectId = getFirebaseProjectId();
    const auth = await getFirebaseAuth();
    const authPage = await auth.listUsers(1);
    const firestore = await getFirestoreDb();
    const firestorePage = await firestore.collection("users").limit(1).get();
    return {
      ok: true,
      projectId,
      auth: { ok: true, sampleCount: authPage.users.length },
      firestore: { ok: true, sampleCount: firestorePage.size },
    };
  }),
});
