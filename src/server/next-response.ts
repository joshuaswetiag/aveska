export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
    return new NextResponse(JSON.stringify(body, (_key, value) => (typeof value === "bigint" ? Number(value) : value)), {
      ...init,
      headers,
    });
  }

  static redirect(url: string | URL, status = 307) {
    return new NextResponse(null, { status, headers: { location: String(url) } });
  }
}
