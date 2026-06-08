import { revalidatePath } from 'next/cache';

export async function POST() {
  revalidatePath('/api/ooo-calendar');
  return Response.json({ revalidated: true });
}
