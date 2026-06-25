import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpTransport, RpcClient, createApi, type Transport } from './api';

describe('RpcClient', () => {
  it('correlates a response to its request by id', async () => {
    const sent: unknown[] = [];
    const client = new RpcClient((msg) => sent.push(msg));
    const p = client.request<{ ok: boolean }>('diff.get', { mode: 'working' });
    expect(sent).toHaveLength(1);
    const id = (sent[0] as { id: number }).id;
    client.receive({ id, ok: true, data: { ok: true } });
    await expect(p).resolves.toEqual({ ok: true });
  });

  it('rejects when the response is not ok', async () => {
    const sent: { id: number }[] = [];
    const client = new RpcClient((msg) => sent.push(msg as { id: number }));
    const p = client.request('comments.create', {});
    client.receive({ id: sent[0].id, ok: false, error: 'file: required' });
    await expect(p).rejects.toThrow('file: required');
  });

  it('ignores responses with an unknown id', async () => {
    const client = new RpcClient(() => {});
    expect(() => client.receive({ id: 999, ok: true, data: null })).not.toThrow();
  });
});

describe('HttpTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('builds the diff query string', async () => {
    const fetchMock = stubFetch(200, { mode: 'compare', raw: '', ignored: [] });
    const t = new HttpTransport();
    await t.request('diff.get', { mode: 'compare', base: 'main', head: 'dev' });
    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit?];
    expect(url).toBe('/api/diff?mode=compare&base=main&head=dev');
  });

  it('POSTs JSON for comments.create', async () => {
    const fetchMock = stubFetch(201, { id: '1' });
    const t = new HttpTransport();
    await t.request('comments.create', { file: 'a.txt', body: 'x' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/comments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ file: 'a.txt', body: 'x' });
  });

  it('returns null when repo.pick is cancelled (409)', async () => {
    stubFetch(409, { error: 'No folder selected.' });
    const t = new HttpTransport();
    await expect(t.request('repo.pick')).resolves.toBeNull();
  });
});

describe('createApi getDiff payload', () => {
  function recordingTransport() {
    const calls: Array<{ op: string; payload?: unknown }> = [];
    const transport: Transport = {
      request: <T>(op: string, payload?: unknown) => {
        calls.push({ op, payload });
        return Promise.resolve(undefined as T);
      },
    };
    return { transport, calls };
  }

  it('omits empty base/head so the rpc/schema path is not sent ""', () => {
    const { transport, calls } = recordingTransport();
    createApi(transport).getDiff('working', '', '');
    expect(calls[0]).toEqual({ op: 'diff.get', payload: { mode: 'working' } });
  });

  it('passes base/head through when they are non-empty', () => {
    const { transport, calls } = recordingTransport();
    createApi(transport).getDiff('compare', 'main', 'dev');
    expect(calls[0]).toEqual({ op: 'diff.get', payload: { mode: 'compare', base: 'main', head: 'dev' } });
  });
});
