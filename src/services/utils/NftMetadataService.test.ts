import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveIpfsUri, fetchNftMetadata } from './NftMetadataService';

// Hoisted: vi.mock is lifted above ordinary declarations.
const { NFT_GATEWAY } = vi.hoisted(() => ({ NFT_GATEWAY: 'https://nft-gateway.example' }));

vi.mock('../../config/contracts', () => ({
  NETWORK_CONFIG: { NFT_IPFS_GATEWAY: NFT_GATEWAY },
}));

vi.mock('quais', () => ({
  Contract: vi.fn(),
  getAddress: (a: string) => a,
}));

vi.mock('../../config/provider', () => ({
  getActiveProvider: () => ({}),
}));

const CID = 'QmTestCidValue';

describe('resolveIpfsUri', () => {
  it('rewrites an ipfs:// uri onto the gateway', () => {
    expect(resolveIpfsUri(`ipfs://${CID}`, NFT_GATEWAY)).toBe(`${NFT_GATEWAY}/ipfs/${CID}`);
  });

  // Some contracts emit `ipfs:Qm...` without the double slash.
  it('rewrites the non-standard single-slash form too', () => {
    expect(resolveIpfsUri(`ipfs:${CID}`, NFT_GATEWAY)).toBe(`${NFT_GATEWAY}/ipfs/${CID}`);
  });

  it('keeps a path after the cid', () => {
    expect(resolveIpfsUri(`ipfs://${CID}/1.json`, NFT_GATEWAY)).toBe(
      `${NFT_GATEWAY}/ipfs/${CID}/1.json`
    );
  });

  it('does not double the slash when the gateway has a trailing one', () => {
    expect(resolveIpfsUri(`ipfs://${CID}`, `${NFT_GATEWAY}/`)).toBe(
      `${NFT_GATEWAY}/ipfs/${CID}`
    );
  });

  it('passes an https url through untouched', () => {
    expect(resolveIpfsUri('https://example.com/a.json', NFT_GATEWAY)).toBe(
      'https://example.com/a.json'
    );
  });

  it('passes a data uri through untouched', () => {
    expect(resolveIpfsUri('data:application/json,{}', NFT_GATEWAY)).toBe(
      'data:application/json,{}'
    );
  });
});

describe('fetchNftMetadata', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const jsonResponse = (body: unknown, contentType = 'application/json') => ({
    ok: true,
    headers: { get: () => contentType },
    json: async () => body,
  });

  describe('host allowlist', () => {
    // Metadata is arbitrary third-party content; it is only fetched from the
    // configured NFT gateway, never from whatever host a token points at.
    it('refuses a url outside the configured gateway', async () => {
      const result = await fetchNftMetadata('https://evil.example/meta.json', NFT_GATEWAY);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result).toEqual({
        name: null,
        description: null,
        image: null,
        rawTokenUri: 'https://evil.example/meta.json',
      });
    });

    it('allows the configured gateway host', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ name: 'Token' }));

      const result = await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY);

      expect(fetchMock).toHaveBeenCalledWith(`${NFT_GATEWAY}/ipfs/${CID}`, expect.anything());
      expect(result.name).toBe('Token');
    });

    it('allows a subdomain of the gateway host', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ name: 'Token' }));

      await fetchNftMetadata('https://cdn.nft-gateway.example/meta.json', NFT_GATEWAY);

      expect(fetchMock).toHaveBeenCalled();
    });

    // A lookalike host must not pass by suffix matching.
    it('refuses a host that merely ends with the gateway name', async () => {
      await fetchNftMetadata('https://evilnft-gateway.example/meta.json', NFT_GATEWAY);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refuses plain http even on the gateway host', async () => {
      await fetchNftMetadata('http://nft-gateway.example/meta.json', NFT_GATEWAY);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('data uris', () => {
    it('decodes url-encoded json without fetching', async () => {
      const uri = `data:application/json,${encodeURIComponent('{"name":"Inline","description":"d"}')}`;

      const result = await fetchNftMetadata(uri, NFT_GATEWAY);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.name).toBe('Inline');
      expect(result.description).toBe('d');
    });

    it('decodes base64 json', async () => {
      const uri = `data:application/json;base64,${btoa('{"name":"B64"}')}`;

      expect((await fetchNftMetadata(uri, NFT_GATEWAY)).name).toBe('B64');
    });

    it('returns empty metadata for malformed json', async () => {
      const result = await fetchNftMetadata('data:application/json,{not json', NFT_GATEWAY);

      expect(result.name).toBeNull();
    });
  });

  describe('response handling', () => {
    it('returns empty metadata on a non-ok response', async () => {
      fetchMock.mockResolvedValue({ ok: false, headers: { get: () => 'application/json' } });

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).name).toBeNull();
    });

    // A gateway that answers with an image or HTML is not metadata.
    it('refuses a non-json content type', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ name: 'Nope' }, 'image/png'));

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).name).toBeNull();
    });

    it('accepts a text content type', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ name: 'Text' }, 'text/plain'));

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).name).toBe('Text');
    });

    it('returns empty metadata when the fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).name).toBeNull();
    });

    it('always reports the raw token uri it was given', async () => {
      fetchMock.mockRejectedValue(new Error('nope'));

      const result = await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY);

      expect(result.rawTokenUri).toBe(`ipfs://${CID}`);
    });
  });

  describe('image resolution', () => {
    it('rewrites an ipfs image onto the gateway', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ image: `ipfs://${CID}/pic.png` }));

      const result = await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY);

      expect(result.image).toBe(`${NFT_GATEWAY}/ipfs/${CID}/pic.png`);
    });

    it('accepts the image_url spelling', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ image_url: `ipfs://${CID}/pic.png` }));

      const result = await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY);

      expect(result.image).toBe(`${NFT_GATEWAY}/ipfs/${CID}/pic.png`);
    });

    it('prefers image over image_url', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ image: 'https://a.example/a.png', image_url: 'https://b.example/b.png' })
      );

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).image).toBe(
        'https://a.example/a.png'
      );
    });

    it('reports no image when neither field is present', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ name: 'No pic' }));

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).image).toBeNull();
    });
  });

  describe('field typing', () => {
    it('ignores non-string name and description', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ name: 42, description: { a: 1 } }));

      const result = await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY);

      expect(result.name).toBeNull();
      expect(result.description).toBeNull();
    });

    it('returns empty metadata when the body is not an object', async () => {
      fetchMock.mockResolvedValue(jsonResponse('a string'));

      expect((await fetchNftMetadata(`ipfs://${CID}`, NFT_GATEWAY)).name).toBeNull();
    });
  });
});
