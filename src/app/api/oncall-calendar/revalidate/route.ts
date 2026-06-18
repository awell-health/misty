import { revalidatePath } from 'next/cache';

export async function POST() {
  revalidatePath('/api/oncall-calendar');
  return Response.json({ revalidated: true });
}
