import zlib from 'node:zlib';

/**
 * A minimal zip writer (no dependency): deflated entries with UTF-8 names,
 * written one after another so an export streams instead of sitting in memory.
 * Plain zip, no zip64: up to 65,535 entries and 4 GB, far beyond a household's bills.
 */

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  name: string;
  /** The contents, or a function that reads them when the entry is written. */
  data: Buffer | string | (() => Buffer);
  date?: Date;
}

const UTF8_NAMES = 0x0800;
const LIMIT = 0xffffffff;

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function* zipStream(entries: Iterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let count = 0;
  for (const e of entries) {
    const raw =
      typeof e.data === 'function'
        ? e.data()
        : typeof e.data === 'string'
          ? Buffer.from(e.data, 'utf8')
          : e.data;
    const deflated = zlib.deflateRawSync(raw);
    // Already-compressed files (most PDFs, photos) are stored as they are.
    const store = deflated.length >= raw.length;
    const body = store ? raw : deflated;
    const crc = zlib.crc32(raw) >>> 0;
    const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
    const { time, date } = dosTime(e.date ?? new Date());
    if (raw.length > LIMIT || offset > LIMIT) throw new Error('Export too large for a zip file');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(UTF8_NAMES, 6);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4); // version made by
    dir.writeUInt16LE(20, 6); // version needed
    dir.writeUInt16LE(UTF8_NAMES, 8);
    dir.writeUInt16LE(store ? 0 : 8, 10);
    dir.writeUInt16LE(time, 12);
    dir.writeUInt16LE(date, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(name.length, 28);
    // extra, comment, disk, internal and external attributes stay 0
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    yield local;
    yield name;
    yield body;
    offset += local.length + name.length + body.length;
    if (++count > 0xffff) throw new Error('Too many files for a zip file');
  }
  const size = central.reduce((n, b) => n + b.length, 0);
  for (const b of central) yield b;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  yield end;
}

/** The whole archive in memory (tests, small exports). */
export async function zipBuffer(entries: Iterable<ZipEntry>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const p of zipStream(entries)) parts.push(p);
  return Buffer.concat(parts);
}

/** A web ReadableStream of the archive, for a route's Response. */
export function zipResponseStream(entries: Iterable<ZipEntry>): ReadableStream<Uint8Array> {
  const it = zipStream(entries);
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await it.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}
