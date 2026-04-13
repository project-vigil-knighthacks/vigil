import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.VIGIL_BACKEND_URL || 'http://127.0.0.1:8000';

async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = `/api/${path.join('/')}`;
  const url = new URL(targetPath, BACKEND_URL);

  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);

  let bodyBuf: ArrayBuffer | undefined;

  if (!['GET', 'HEAD'].includes(request.method)) {
    bodyBuf = await request.arrayBuffer();
    headers.set('content-length', String(bodyBuf.byteLength));
  }

  try {
    const res = await fetch(url, {
      method: request.method,
      headers,
      body: bodyBuf,
    });

    const responseHeaders = new Headers(res.headers);
    responseHeaders.delete('connection');
    responseHeaders.delete('transfer-encoding');

    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { detail: 'Backend unavailable' },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
