export function GET() {
  return new Response(null, { status: 404 });
}

export function POST() {
  return GET();
}
