import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { today } from "@/server/today";
import { defaultYear } from "@/server/year";

export const dynamic = "force-dynamic";

export default function DeclaracionIndex() {
  redirect(`/declaracion/${defaultYear(getDb(), today())}`);
}
